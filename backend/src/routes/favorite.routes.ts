import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type ProductWithCategory = Prisma.ProductGetPayload<{
  include: {
    category: true;
  };
}>;

function mapProduct(product: ProductWithCategory) {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl,
    description: product.description,
    category: product.category.title,
  };
}

export const productsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      category?: string;
    };

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        category:
          query.category && query.category !== "Все"
            ? {
                title: query.category,
              }
            : undefined,
      },
      include: {
        category: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return products.map(mapProduct);
  });

  app.get("/:id", async (request, reply) => {
    const params = request.params as {
      id: string;
    };

    const productId = Number(params.id);

    if (!Number.isInteger(productId)) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return mapProduct(product);
  });
};