import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { findCatalogProduct, getCatalogProducts } from "../services/catalog.service";
import { getCurrentUser } from "../services/user.service";

export const favoriteRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      category?: string;
    };
    const user = await getCurrentUser(request);
    const products = await getCatalogProducts(user.id);

    return products.filter((product) => {
      if (!product.isFavorite) {
        return false;
      }

      if (!query.category || query.category === "Все") {
        return true;
      }

      return product.categoryTitle === query.category;
    });
  });

  app.post("/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productId: string;
    };
    const product = await findCatalogProduct(params.productId);

    if (!product || !product.isActive) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    await prisma.favoriteItem.upsert({
      where: {
        userId_productId: {
          userId: user.id,
          productId: product.productId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        productId: product.productId,
      },
    });

    return {
      productId: product.productId,
      isFavorite: true,
    };
  });

  app.delete("/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productId: string;
    };

    await prisma.favoriteItem.deleteMany({
      where: {
        userId: user.id,
        productId: params.productId,
      },
    });

    return {
      productId: params.productId,
      isFavorite: false,
    };
  });
};
