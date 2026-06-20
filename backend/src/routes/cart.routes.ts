import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import type { AddToCartBody, UpdateCartBody } from "../types/cart.types";

type CartItemWithVariant = Prisma.CartItemGetPayload<{
  include: {
    productVariant: {
      include: {
        images: true;
      };
    };
  };
}>;

function mapCartItem(item: CartItemWithVariant) {
  const variant = item.productVariant;
  const image = variant.images[0];
  const lineTotal = variant.price * item.quantity;

  return {
    id: item.id,
    productId: variant.productId,
    productVariantId: item.productVariantId,
    title: variant.title,
    optionLabel: variant.optionLabel,
    price: variant.price,
    imageUrl: image?.url ?? null,
    quantity: item.quantity,
    maxQuantity: variant.maxQuantity,
    lineTotal,
  };
}

async function getCartResponse(userId: number) {
  const cartItems = await prisma.cartItem.findMany({
    where: {
      userId,
    },
    include: {
      productVariant: {
        include: {
          images: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const items = cartItems.map(mapCartItem);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    items,
    totalQuantity,
    totalPrice,
    cartCount: totalQuantity,
  };
}

async function findAvailableVariant(productVariantId: number) {
  return prisma.productVariant.findFirst({
    where: {
      id: productVariantId,
      isActive: true,
      product: {
        isActive: true,
      },
    },
    select: {
      id: true,
      maxQuantity: true,
    },
  });
}

export const cartRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const user = await getCurrentUser(request);

    return getCartResponse(user.id);
  });

  app.post("/items", async (request, reply) => {
    const user = await getCurrentUser(request);
    const body = (request.body ?? {}) as AddToCartBody;

    if (
      body.productVariantId === undefined ||
      !Number.isInteger(body.productVariantId) ||
      body.productVariantId <= 0
    ) {
      return reply.status(400).send({
        message: "productVariantId обязателен",
      });
    }

    const quantity = body.quantity ?? 1;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return reply.status(400).send({
        message: "quantity должен быть положительным числом",
      });
    }

    const variant = await findAvailableVariant(body.productVariantId);

    if (!variant) {
      return reply.status(404).send({
        message: "Вариант товара не найден",
      });
    }

    const currentCartItem = await prisma.cartItem.findUnique({
      where: {
        userId_productVariantId: {
          userId: user.id,
          productVariantId: body.productVariantId,
        },
      },
    });

    const nextQuantity = (currentCartItem?.quantity ?? 0) + quantity;

    if (nextQuantity > variant.maxQuantity) {
      return reply.status(400).send({
        message: "Нельзя добавить больше товара, чем есть в наличии",
      });
    }

    await prisma.cartItem.upsert({
      where: {
        userId_productVariantId: {
          userId: user.id,
          productVariantId: body.productVariantId,
        },
      },
      update: {
        quantity: nextQuantity,
      },
      create: {
        userId: user.id,
        productVariantId: body.productVariantId,
        quantity,
      },
    });

    return getCartResponse(user.id);
  });

  app.patch("/items/:productVariantId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productVariantId: string;
    };
    const body = (request.body ?? {}) as UpdateCartBody;
    const productVariantId = Number(params.productVariantId);

    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта товара",
      });
    }

    if (body.quantity === undefined || !Number.isInteger(body.quantity)) {
      return reply.status(400).send({
        message: "quantity обязателен",
      });
    }

    if (body.quantity <= 0) {
      await prisma.cartItem.deleteMany({
        where: {
          userId: user.id,
          productVariantId,
        },
      });

      return getCartResponse(user.id);
    }

    const variant = await findAvailableVariant(productVariantId);

    if (!variant) {
      return reply.status(404).send({
        message: "Вариант товара не найден",
      });
    }

    if (body.quantity > variant.maxQuantity) {
      return reply.status(400).send({
        message: "Нельзя добавить больше товара, чем есть в наличии",
      });
    }

    await prisma.cartItem.upsert({
      where: {
        userId_productVariantId: {
          userId: user.id,
          productVariantId,
        },
      },
      update: {
        quantity: body.quantity,
      },
      create: {
        userId: user.id,
        productVariantId,
        quantity: body.quantity,
      },
    });

    return getCartResponse(user.id);
  });

  app.delete("/items/:productVariantId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productVariantId: string;
    };
    const productVariantId = Number(params.productVariantId);

    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта товара",
      });
    }

    await prisma.cartItem.deleteMany({
      where: {
        userId: user.id,
        productVariantId,
      },
    });

    return getCartResponse(user.id);
  });
};
