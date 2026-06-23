import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import {
  mapAdminVariant,
  parseAdminVariantPatch,
  sendVariantValidationError,
} from "./products.routes.js";

async function updateVariantSortOrder(variantId: number, sortOrder: number) {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({
      where: {
        id: variantId,
      },
      select: {
        id: true,
        productId: true,
        sortOrder: true,
      },
    });

    if (!variant) {
      throw new Error("VARIANT_NOT_FOUND");
    }

    const variants = await tx.productVariant.findMany({
      where: {
        productId: variant.productId,
      },
      orderBy: {
        sortOrder: "asc",
      },
      select: {
        id: true,
      },
    });

    const reorderedIds = variants
      .map((item) => item.id)
      .filter((id) => id !== variantId);
    const targetIndex = Math.min(Math.max(sortOrder, 0), reorderedIds.length);
    reorderedIds.splice(targetIndex, 0, variantId);

    for (const [index, id] of reorderedIds.entries()) {
      await tx.productVariant.update({
        where: {
          id,
        },
        data: {
          sortOrder: -(index + 1),
        },
      });
    }

    for (const [index, id] of reorderedIds.entries()) {
      await tx.productVariant.update({
        where: {
          id,
        },
        data: {
          sortOrder: index,
        },
      });
    }
  });
}

export const variantsRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/:variantId", async (request, reply) => {
    const params = request.params as {
      variantId: string;
    };
    const variantId = Number(params.variantId);

    if (!Number.isInteger(variantId) || variantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта",
      });
    }

    let data: Prisma.ProductVariantUncheckedUpdateInput;

    try {
      data = parseAdminVariantPatch((request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      return sendVariantValidationError(error, reply);
    }

    const sortOrder = data.sortOrder;
    delete data.sortOrder;

    if (typeof sortOrder === "number") {
      try {
        await updateVariantSortOrder(variantId, sortOrder);
      } catch (error) {
        if (error instanceof Error && error.message === "VARIANT_NOT_FOUND") {
          return reply.status(404).send({
            message: "Вариант не найден",
          });
        }

        throw error;
      }
    }

    const variant = await prisma.productVariant.update({
      where: {
        id: variantId,
      },
      data,
      include: {
        images: {
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    return mapAdminVariant(variant);
  });
};
