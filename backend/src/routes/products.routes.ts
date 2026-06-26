import type { FastifyPluginAsync } from "fastify";

import { getCatalogProducts, findCatalogProduct } from "../services/catalog.service";
import { getCurrentUser } from "../services/user.service";

export const productsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      category?: string;
    };
    const user = await getCurrentUser(request);
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
    const product = await findCatalogProduct(params.productId, user.id);

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return product;
  });
};
