import type { FastifyPluginAsync } from "fastify";

import { getCatalogProducts, findCatalogProduct } from "../services/catalog.service";
import { getCurrentUser } from "../services/user.service";

export const productsRoutes: FastifyPluginAsync = async (app) => {
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
      "products_fetch_started",
    );

    const products = await getCatalogProducts(user.id);

    return products.filter((product) => {
      if (!query.category || query.category === "Все") {
        return product.variants.some((variant) => {
          return variant.isActive && variant.maxQuantity > 0;
        });
      }

      return (
        product.categoryTitle === query.category &&
        product.variants.some((variant) => {
          return variant.isActive && variant.maxQuantity > 0;
        })
      );
    });
  });

  app.get("/:productId", async (request, reply) => {
    const params = request.params as {
      productId: string;
    };
    const user = await getCurrentUser(request);

    request.log.info(
      {
        userId: user.id,
        productId: params.productId,
      },
      "product_details_fetch_started",
    );

    const product = await findCatalogProduct(params.productId, user.id);

    if (!product) {
      request.log.warn(
        {
          userId: user.id,
          productId: params.productId,
        },
        "product_details_not_found",
      );
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return product;
  });
};
