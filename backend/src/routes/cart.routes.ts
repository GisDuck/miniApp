import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { findCatalogVariant } from "../services/catalog.service";
import { getCurrentUser } from "../services/user.service";
import type { AddToCartBody, UpdateCartBody } from "../types/cart.types";

type CartItemStockStatus = "AVAILABLE" | "LIMITED" | "OUT_OF_STOCK";

async function mapCartItem(item: {
  id: number;
  productVariantId: string;
  quantity: number;
}) {
  const catalogItem = await findCatalogVariant(item.productVariantId);

  if (!catalogItem) {
    return {
      id: item.id,
      productId: "",
      productVariantId: item.productVariantId,
      title: "Товар недоступен",
      optionLabel: "",
      price: 0,
      imageUrl: null,
      quantity: item.quantity,
      availableQuantity: 0,
      lineTotal: 0,
      stockStatus: "OUT_OF_STOCK" as CartItemStockStatus,
    };
  }

  const { product, variant } = catalogItem;
  const availableQuantity =
    product.isActive && variant.isActive ? variant.maxQuantity : 0;
  let stockStatus: CartItemStockStatus = "AVAILABLE";

  if (availableQuantity <= 0) {
    stockStatus = "OUT_OF_STOCK";
  } else if (item.quantity > availableQuantity) {
    stockStatus = "LIMITED";
  }

  return {
    id: item.id,
    productId: product.productId,
    productVariantId: item.productVariantId,
    title: variant.title,
    optionLabel: variant.optionLabel,
    price: variant.price,
    imageUrl: variant.imageUrl,
    quantity: item.quantity,
    availableQuantity,
    lineTotal: variant.price * item.quantity,
    stockStatus,
  };
}

async function getCartResponse(userId: number) {
  const cartItems = await prisma.cartItem.findMany({
    where: {
      userId,
    },
    orderBy: {
      id: "asc",
    },
  });
  const items = await Promise.all(cartItems.map(mapCartItem));
  const availableItems = items.filter((item) => {
    return item.stockStatus === "AVAILABLE";
  });
  const totalQuantity = availableItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const totalPrice = availableItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    totalQuantity,
    totalPrice,
    cartCount,
  };
}

function isValidUuidLikeId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const cartRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const user = await getCurrentUser(request);

    request.log.info(
      {
        userId: user.id,
      },
      "cart_fetch_started",
    );

    return getCartResponse(user.id);
  });

  app.post("/items", async (request, reply) => {
    const user = await getCurrentUser(request);
    const body = (request.body ?? {}) as AddToCartBody;

    if (!isValidUuidLikeId(body.productVariantId)) {
      request.log.warn(
        {
          userId: user.id,
        },
        "cart_add_invalid_product_variant_id",
      );
      return reply.status(400).send({
        message: "productVariantId обязателен",
      });
    }

    const quantity = body.quantity ?? 1;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId: body.productVariantId,
          quantity,
        },
        "cart_add_invalid_quantity",
      );
      return reply.status(400).send({
        message: "quantity должен быть положительным числом",
      });
    }

    const catalogItem = await findCatalogVariant(body.productVariantId);

    if (
      !catalogItem ||
      !catalogItem.product.isActive ||
      !catalogItem.variant.isActive ||
      catalogItem.variant.maxQuantity <= 0
    ) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId: body.productVariantId,
        },
        "cart_add_variant_unavailable",
      );
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

    if (nextQuantity > catalogItem.variant.maxQuantity) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId: body.productVariantId,
          requestedQuantity: nextQuantity,
          availableQuantity: catalogItem.variant.maxQuantity,
        },
        "cart_add_quantity_exceeded",
      );
      return reply.status(400).send({
        message: "Нельзя добавить больше товара, чем есть в наличии",
      });
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId: body.productVariantId,
        quantity,
        nextQuantity,
      },
      "cart_add_started",
    );

    try {
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
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          productVariantId: body.productVariantId,
        },
        "cart_add_failed",
      );
      throw error;
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId: body.productVariantId,
        nextQuantity,
      },
      "cart_add_completed",
    );

    return getCartResponse(user.id);
  });

  app.patch("/items/:productVariantId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productVariantId: string;
    };
    const body = (request.body ?? {}) as UpdateCartBody;
    const productVariantId = params.productVariantId;

    if (!isValidUuidLikeId(productVariantId)) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId,
        },
        "cart_update_invalid_product_variant_id",
      );
      return reply.status(400).send({
        message: "Некорректный id варианта товара",
      });
    }

    if (body.quantity === undefined || !Number.isInteger(body.quantity)) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId,
          quantity: body.quantity,
        },
        "cart_update_invalid_quantity",
      );
      return reply.status(400).send({
        message: "quantity обязателен",
      });
    }

    if (body.quantity <= 0) {
      request.log.info(
        {
          userId: user.id,
          productVariantId,
        },
        "cart_update_delete_started",
      );

      try {
        await prisma.cartItem.deleteMany({
          where: {
            userId: user.id,
            productVariantId,
          },
        });
      } catch (error) {
        request.log.error(
          {
            err: error,
            userId: user.id,
            productVariantId,
          },
          "cart_update_delete_failed",
        );
        throw error;
      }

      request.log.info(
        {
          userId: user.id,
          productVariantId,
        },
        "cart_update_delete_completed",
      );

      return getCartResponse(user.id);
    }

    const currentCartItem = await prisma.cartItem.findUnique({
      where: {
        userId_productVariantId: {
          userId: user.id,
          productVariantId,
        },
      },
    });

    if (currentCartItem && body.quantity <= currentCartItem.quantity) {
      request.log.info(
        {
          userId: user.id,
          productVariantId,
          quantity: body.quantity,
        },
        "cart_update_decrease_started",
      );

      try {
        await prisma.cartItem.update({
          where: {
            userId_productVariantId: {
              userId: user.id,
              productVariantId,
            },
          },
          data: {
            quantity: body.quantity,
          },
        });
      } catch (error) {
        request.log.error(
          {
            err: error,
            userId: user.id,
            productVariantId,
          },
          "cart_update_decrease_failed",
        );
        throw error;
      }

      return getCartResponse(user.id);
    }

    const catalogItem = await findCatalogVariant(productVariantId);

    if (!catalogItem || !catalogItem.product.isActive || !catalogItem.variant.isActive) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId,
        },
        "cart_update_variant_unavailable",
      );
      return reply.status(404).send({
        message: "Вариант товара не найден",
      });
    }

    if (body.quantity > catalogItem.variant.maxQuantity) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId,
          requestedQuantity: body.quantity,
          availableQuantity: catalogItem.variant.maxQuantity,
        },
        "cart_update_quantity_exceeded",
      );
      return reply.status(400).send({
        message: "Нельзя добавить больше товара, чем есть в наличии",
      });
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId,
        quantity: body.quantity,
      },
      "cart_update_started",
    );

    try {
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
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          productVariantId,
        },
        "cart_update_failed",
      );
      throw error;
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId,
        quantity: body.quantity,
      },
      "cart_update_completed",
    );

    return getCartResponse(user.id);
  });

  app.delete("/items/:productVariantId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      productVariantId: string;
    };

    if (!isValidUuidLikeId(params.productVariantId)) {
      request.log.warn(
        {
          userId: user.id,
          productVariantId: params.productVariantId,
        },
        "cart_delete_invalid_product_variant_id",
      );
      return reply.status(400).send({
        message: "Некорректный id варианта товара",
      });
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId: params.productVariantId,
      },
      "cart_delete_started",
    );

    try {
      await prisma.cartItem.deleteMany({
        where: {
          userId: user.id,
          productVariantId: params.productVariantId,
        },
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          productVariantId: params.productVariantId,
        },
        "cart_delete_failed",
      );
      throw error;
    }

    request.log.info(
      {
        userId: user.id,
        productVariantId: params.productVariantId,
      },
      "cart_delete_completed",
    );

    return getCartResponse(user.id);
  });
};
