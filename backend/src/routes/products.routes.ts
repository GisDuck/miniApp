import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

type ProductWithVariants = Prisma.ProductGetPayload<{
  include: {
    category: true;
    variants: {
      include: {
        images: true;
      };
    };
  };
}>;

function mapCatalogVariant(
  variant: ProductWithVariants["variants"][number],
) {
  const images = variant.images.map((image) => image.url);

  return {
    productVariantId: variant.id,
    title: variant.title,
    optionLabel: variant.optionLabel,
    description: variant.description,
    price: variant.price,
    imageUrl: images[0] ?? null,
    images,
    maxQuantity: variant.maxQuantity,
    isActive: variant.isActive,
  };
}

function mapCatalogProduct(product: ProductWithVariants) {
  const variants = product.variants.map(mapCatalogVariant);
  const mainVariant = variants[0];

  return {
    productId: product.id,
    categoryId: product.categoryId,
    categoryTitle: product.category.title,
    description: product.description,
    isActive: product.isActive,
    mainVariant,
    variants,
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
