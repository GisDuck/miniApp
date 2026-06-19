import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import { mapCatalogProduct } from "../mappers/product.mapper";

export const productsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      category?: string;
    };

    const user = await getCurrentUser(request);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
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

  app.get("/:productId", async (request, reply) => {
    const params = request.params as {
      productId: string;
    };

    const user = await getCurrentUser(request);

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
    });

    if (!product || product.variants.length === 0) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return mapCatalogProduct(product);
  });
};
