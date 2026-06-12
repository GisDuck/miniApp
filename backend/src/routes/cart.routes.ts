import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import type { AddToCartBody, UpdateCartBody } from "../types/cart.types";

type CartItemWithProduct = Prisma.CartItemGetPayload<{
  include: {
    product: {
      include: {
        category: true;
      };
    };
  };
}>;

function mapCartItem(item: CartItemWithProduct) {
  const price = Number(item.product.price);
  const totalPrice = price * item.quantity;

  return {
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    product: {
      id: item.product.id,
      title: item.product.title,
      price,
      imageUrl: item.product.imageUrl,
      description: item.product.description,
      category: item.product.category.title,
    },
    totalPrice,
  };
}

async function getCartResponse(userId: number) {
  const cartItems = await prisma.cartItem.findMany({
    where: {
      userId,
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const items = cartItems.map(mapCartItem);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return {
    items,
    totalQuantity,
    totalPrice,

    // Оставляем для совместимости с CatalogPage.
    // Там сейчас ожидается cartCount после добавления товара.
    cartCount: totalQuantity,
  };
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
      body.productId === undefined ||
      !Number.isInteger(body.productId) ||
      body.productId <= 0
    ) {
      return reply.status(400).send({
        message: "productId обязателен",
      });
    }

    const quantity = body.quantity ?? 1;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return reply.status(400).send({
        message: "quantity должен быть положительным числом",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: body.productId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    await prisma.cartItem.upsert({
      where: {
        userId_productId: {
          userId: user.id,
          productId: body.productId,
        },
      },
      update: {
        quantity: {
          increment: quantity,
        },
      },
      create: {
        userId: user.id,
        productId: body.productId,
        quantity,
      },
    });

    return getCartResponse(user.id);
  });

  app.patch("/items/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);

    const params = request.params as {
      productId: string;
    };

    const body = (request.body ?? {}) as UpdateCartBody;
    const productId = Number(params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    if (body.quantity === undefined || !Number.isInteger(body.quantity)) {
      return reply.status(400).send({
        message: "quantity обязателен",
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    if (body.quantity <= 0) {
      await prisma.cartItem.deleteMany({
        where: {
          userId: user.id,
          productId,
        },
      });

      return getCartResponse(user.id);
    }

    await prisma.cartItem.upsert({
      where: {
        userId_productId: {
          userId: user.id,
          productId,
        },
      },
      update: {
        quantity: body.quantity,
      },
      create: {
        userId: user.id,
        productId,
        quantity: body.quantity,
      },
    });

    return getCartResponse(user.id);
  });

  app.delete("/items/:productId", async (request, reply) => {
    const user = await getCurrentUser(request);

    const params = request.params as {
      productId: string;
    };

    const productId = Number(params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id товара",
      });
    }

    await prisma.cartItem.deleteMany({
      where: {
        userId: user.id,
        productId,
      },
    });

    return getCartResponse(user.id);
  });
};