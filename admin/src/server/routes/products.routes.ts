import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import type { SerializableImage, SerializableProduct, SerializableVariant } from "../types.js";

type ProductWithAdminIncludes = Prisma.ProductGetPayload<{
  include: {
    category: true;
    _count: {
      select: {
        favoriteItems: true;
        variants: true;
      };
    };
    variants: {
      include: {
        images: {
          orderBy: {
            sortOrder: "asc";
          };
          take: 1;
        };
      };
      orderBy: {
        sortOrder: "asc";
      };
    };
  };
}>;

type ProductDetails = Prisma.ProductGetPayload<{
  include: {
    category: true;
    _count: {
      select: {
        favoriteItems: true;
      };
    };
    variants: {
      include: {
        images: true;
      };
    };
  };
}>;

function toBoolean(value: unknown) {
  return value === true || value === "true";
}

function parsePositiveInt(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapImage(image: {
  id: number;
  productVariantId: number;
  url: string;
  sortOrder: number;
}): SerializableImage {
  return {
    id: image.id,
    productVariantId: image.productVariantId,
    url: image.url,
    sortOrder: image.sortOrder,
  };
}

function mapVariant(variant: ProductDetails["variants"][number]): SerializableVariant {
  return {
    id: variant.id,
    productId: variant.productId,
    moySkladId: variant.moySkladId.toString(),
    optionLabel: variant.optionLabel,
    title: variant.title,
    description: variant.description,
    price: variant.price,
    maxQuantity: variant.maxQuantity,
    isActive: variant.isActive,
    sortOrder: variant.sortOrder,
    images: variant.images.sort((a, b) => a.sortOrder - b.sortOrder).map(mapImage),
  };
}

function mapProduct(product: ProductWithAdminIncludes): SerializableProduct {
  return {
    id: product.id,
    description: product.description,
    isActive: product.isActive,
    categoryId: product.categoryId,
    categoryTitle: product.category.title,
    firstVariantTitle: product.variants[0]?.title ?? null,
    previewImageUrl: product.variants[0]?.images[0]?.url ?? null,
    likesCount: product._count.favoriteItems,
    variantsCount: product._count.variants,
    inStockCount: product.variants.filter(
      (variant) => variant.isActive && variant.maxQuantity > 0,
    ).length,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function mapProductDetails(product: ProductDetails) {
  return {
    id: product.id,
    description: product.description,
    isActive: product.isActive,
    categoryId: product.categoryId,
    categoryTitle: product.category.title,
    likesCount: product._count.favoriteItems,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapVariant),
  };
}

function parseVariantData(body: Record<string, unknown>, partial: boolean) {
  const data: Prisma.ProductVariantUncheckedUpdateInput = {};

  if (!partial || body.moySkladId !== undefined) {
    const moySkladId = String(body.moySkladId ?? "").trim();

    if (!/^\d+$/.test(moySkladId)) {
      throw new Error("MOYSKLAD_ID_INVALID");
    }

    data.moySkladId = BigInt(moySkladId);
  }

  if (!partial || body.optionLabel !== undefined) {
    const optionLabel = String(body.optionLabel ?? "").trim();

    if (!optionLabel) {
      throw new Error("OPTION_LABEL_REQUIRED");
    }

    data.optionLabel = optionLabel;
  }

  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? "").trim();

    if (!title) {
      throw new Error("TITLE_REQUIRED");
    }

    data.title = title;
  }

  if (body.description !== undefined) {
    const description = String(body.description ?? "").trim();
    data.description = description || null;
  }

  if (!partial || body.price !== undefined) {
    const price = Number(body.price);

    if (!Number.isInteger(price) || price < 0) {
      throw new Error("PRICE_INVALID");
    }

    data.price = price;
  }

  if (!partial || body.maxQuantity !== undefined) {
    const maxQuantity = Number(body.maxQuantity);

    if (!Number.isInteger(maxQuantity) || maxQuantity < 0) {
      throw new Error("QUANTITY_INVALID");
    }

    data.maxQuantity = maxQuantity;
  }

  if (body.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);

    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("SORT_ORDER_INVALID");
    }

    data.sortOrder = sortOrder;
  }

  return data;
}

function mapVariantError(error: unknown, reply: FastifyReply) {
  const message = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    MOYSKLAD_ID_INVALID: "Введите числовой moySkladId",
    OPTION_LABEL_REQUIRED: "Введите название варианта",
    TITLE_REQUIRED: "Введите заголовок варианта",
    PRICE_INVALID: "Цена должна быть целым числом от 0",
    QUANTITY_INVALID: "Количество должно быть целым числом от 0",
    SORT_ORDER_INVALID: "Порядок должен быть целым числом от 0",
  };

  return reply.status(400).send({
    message: messages[message] ?? "Некорректные данные варианта",
  });
}

export const productsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      q?: string;
      categoryId?: string;
      active?: string;
      stock?: string;
    };
    const categoryId = parsePositiveInt(query.categoryId);
    const search = query.q?.trim();

    const where: Prisma.ProductWhereInput = {
      categoryId: categoryId ?? undefined,
      isActive: query.active === undefined ? undefined : toBoolean(query.active),
      variants:
        query.stock === "in"
          ? {
              some: {
                isActive: true,
                maxQuantity: {
                  gt: 0,
                },
              },
            }
          : query.stock === "out"
            ? {
                none: {
                  isActive: true,
                  maxQuantity: {
                    gt: 0,
                  },
                },
              }
            : undefined,
      OR: search
        ? [
            {
              description: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              variants: {
                some: {
                  OR: [
                    {
                      title: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                    {
                      optionLabel: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          ]
        : undefined,
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        _count: {
          select: {
            favoriteItems: true,
            variants: true,
          },
        },
        variants: {
          include: {
            images: {
              orderBy: {
                sortOrder: "asc",
              },
              take: 1,
            },
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    return products.map(mapProduct);
  });

  app.post("/", async (request, reply) => {
    const body = (request.body ?? {}) as {
      categoryId?: number;
      description?: string;
      isActive?: boolean;
    };
    const categoryId = Number(body.categoryId);
    const description = body.description?.trim() ?? "";

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return reply.status(400).send({
        message: "Выберите категорию",
      });
    }

    if (!description) {
      return reply.status(400).send({
        message: "Введите описание товара",
      });
    }

    const product = await prisma.product.create({
      data: {
        categoryId,
        description,
        isActive: Boolean(body.isActive),
      },
      include: {
        category: true,
        _count: {
          select: {
            favoriteItems: true,
          },
        },
        variants: {
          include: {
            images: true,
          },
        },
      },
    });

    return reply.status(201).send(mapProductDetails(product));
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

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        category: true,
        _count: {
          select: {
            favoriteItems: true,
          },
        },
        variants: {
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

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return mapProductDetails(product);
  });

  app.patch("/:productId", async (request, reply) => {
    const params = request.params as {
      productId: string;
    };
    const productId = Number(params.productId);
    const body = (request.body ?? {}) as {
      categoryId?: number;
      description?: string;
      isActive?: boolean;
    };

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    const data: Prisma.ProductUpdateInput = {};

    if (body.categoryId !== undefined) {
      const categoryId = Number(body.categoryId);

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return reply.status(400).send({
          message: "Выберите категорию",
        });
      }

      data.category = {
        connect: {
          id: categoryId,
        },
      };
    }

    if (body.description !== undefined) {
      const description = body.description.trim();

      if (!description) {
        return reply.status(400).send({
          message: "Введите описание товара",
        });
      }

      data.description = description;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    const product = await prisma.product.update({
      where: {
        id: productId,
      },
      data,
      include: {
        category: true,
        _count: {
          select: {
            favoriteItems: true,
          },
        },
        variants: {
          include: {
            images: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    return mapProductDetails(product);
  });

  app.post("/:productId/variants", async (request, reply) => {
    const params = request.params as {
      productId: string;
    };
    const productId = Number(params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    let data: Prisma.ProductVariantUncheckedUpdateInput;

    try {
      data = parseVariantData((request.body ?? {}) as Record<string, unknown>, false);
    } catch (error) {
      return mapVariantError(error, reply);
    }

    const lastVariant = await prisma.productVariant.findFirst({
      where: {
        productId,
      },
      orderBy: {
        sortOrder: "desc",
      },
      select: {
        sortOrder: true,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        moySkladId: data.moySkladId as bigint,
        optionLabel: data.optionLabel as string,
        title: data.title as string,
        description: (data.description as string | null | undefined) ?? null,
        price: data.price as number,
        maxQuantity: data.maxQuantity as number,
        isActive: (data.isActive as boolean | undefined) ?? true,
        sortOrder:
          typeof data.sortOrder === "number"
            ? data.sortOrder
            : (lastVariant?.sortOrder ?? -1) + 1,
      },
      include: {
        images: true,
      },
    });

    return reply.status(201).send(mapVariant(variant));
  });
};

export function mapAdminVariant(variant: ProductDetails["variants"][number]) {
  return mapVariant(variant);
}

export function parseAdminVariantPatch(body: Record<string, unknown>) {
  return parseVariantData(body, true);
}

export function sendVariantValidationError(error: unknown, reply: FastifyReply) {
  return mapVariantError(error, reply);
}
