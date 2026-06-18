import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

type ProductWithMainVariant = Prisma.ProductGetPayload<{
  include: {
    category: true;
    variants: {
      include: {
        images: true;
      };
    };
  };
}>;

function mapCatalogProduct(product: ProductWithMainVariant) {
  const variant = product.variants[0];
  const image = variant.images[0];

  return {
    productId: product.id,
    productVariantId: variant.id,
    categoryId: product.categoryId,
    categoryTitle: product.category.title,
    title: variant.title,
    optionLabel: variant.optionLabel,
    description: variant.description,
    price: variant.price,
    imageUrl: image?.url ?? null,
    maxQuantity: variant.maxQuantity,
    isActive: product.isActive && variant.isActive,
    isFavorite: false,
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
        variants: {
          some: {
            isActive: true,
          },
        },
      },
      include: {
        category: true,
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
          take: 1,
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

  app.get("/:id", async (request, reply) => {
    const params = request.params as {
      id: string;
    };

    const productVariantId = Number(params.id);

    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта товара",
      });
    }

    const variant = await prisma.productVariant.findFirst({
      where: {
        id: productVariantId,
        isActive: true,
        product: {
          isActive: true,
        },
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
        images: {
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    if (!variant) {
      return reply.status(404).send({
        message: "Вариант товара не найден",
      });
    }

    return mapCatalogProduct({
      ...variant.product,
      category: variant.product.category,
      variants: [
        {
          ...variant,
          images: variant.images,
        },
      ],
    });
  });
};
