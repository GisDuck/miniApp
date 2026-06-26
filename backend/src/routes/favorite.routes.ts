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

    request.log.info(
      {
        userId: user.id,
        category: query.category,
      },
      "favorites_fetch_started",
    );

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
      request.log.warn(
        {
          userId: user.id,
          productId: params.productId,
        },
        "favorite_add_product_not_found",
      );
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    request.log.info(
      {
        userId: user.id,
        productId: product.productId,
      },
      "favorite_add_started",
    );

    try {
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
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          productId: product.productId,
        },
        "favorite_add_failed",
      );
      throw error;
    }

    request.log.info(
      {
        userId: user.id,
        productId: product.productId,
      },
      "favorite_add_completed",
    );

    return {
      productId: product.productId,
      isFavorite: true,
    };
  });

  app.delete("/:productId", async (request) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productId: string;
    };

    request.log.info(
      {
        userId: user.id,
        productId: params.productId,
      },
      "favorite_delete_started",
    );

    try {
      await prisma.favoriteItem.deleteMany({
        where: {
          userId: user.id,
          productId: params.productId,
        },
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          productId: params.productId,
        },
        "favorite_delete_failed",
      );
      throw error;
    }

    request.log.info(
      {
        userId: user.id,
        productId: params.productId,
      },
      "favorite_delete_completed",
    );

    return {
      productId: params.productId,
      isFavorite: false,
    };
  });
};
