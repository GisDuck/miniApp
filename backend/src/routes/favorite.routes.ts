import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import { mapCatalogProduct } from "../mappers/product.mapper";

export const favoriteRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      category?: string;
    };

    const user = await getCurrentUser(request);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        favoriteItems: {
          some: {
            userId: user.id,
          },
        },
        category:
          query.category && query.category !== "Все"
            ? {
                title: query.category,
              }
            : undefined,
        variants: {
          some: {
            isActive: true,
          },
        },
      },
      include: {
        category: true,
        favoriteItems: {
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        },
        variants: {
          where: {
            isActive: true,
          },
          include: {
            images: {
              orderBy: {
                sortOrder: "asc",
              },
            },
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    return products
      .filter((product) => product.variants.length > 0)
      .map(mapCatalogProduct);
  });

  app.post("/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productId: string;
    };
    const productId = Number(params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        variants: {
          some: {
            isActive: true,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    await prisma.favoriteItem.upsert({
      where: {
        userId_productId: {
          userId: user.id,
          productId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        productId,
      },
    });

    return {
      productId,
      isFavorite: true,
    };
  });

  app.delete("/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productId: string;
    };
    const productId = Number(params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    await prisma.favoriteItem.deleteMany({
      where: {
        userId: user.id,
        productId,
      },
    });

    return {
      productId,
      isFavorite: false,
    };
  });
};
