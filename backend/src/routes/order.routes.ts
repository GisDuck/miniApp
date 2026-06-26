import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { redisReleaseLock, redisSetLock } from "../lib/redis";
import {
  findCatalogVariant,
  refreshCatalogVariantStocks,
} from "../services/catalog.service";
import {
  createMoySkladCounterparty,
  createMoySkladCustomerOrder,
  getMoySkladStockByAssortmentId,
} from "../services/moysklad.service";
import { getCurrentUser } from "../services/user.service";
import type { MoySkladMeta } from "../types/catalog.types";
import type { CreateOrderBody } from "../types/order.types";

type StockErrorCode = "OUT_OF_STOCK" | "QUANTITY_EXCEEDED";

type StockErrorItem = {
  productVariantId: string;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
};

type CheckoutLock = {
  key: string;
  value: string;
};

type OrderItemDraft = {
  cartItemId: number;
  productVariantId: string;
  title: string;
  quantity: number;
  price: number;
  assortmentMeta: MoySkladMeta;
};

class CartStockError extends Error {
  code: StockErrorCode;
  items: StockErrorItem[];

  constructor(code: StockErrorCode, items: StockErrorItem[]) {
    super(code);
    this.code = code;
    this.items = items;
  }
}

class CheckoutLockError extends Error {
  constructor() {
    super("CHECKOUT_LOCKED");
  }
}

async function getOrCreateCounterparty(input: {
  userId: number;
  customerName: string;
  customerPhone: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: input.userId,
    },
    select: {
      moySkladCounterpartyId: true,
    },
  });

  if (user.moySkladCounterpartyId) {
    return user.moySkladCounterpartyId;
  }

  const counterparty = await createMoySkladCounterparty({
    name: input.customerName,
    phone: input.customerPhone,
    description: `Created from Telegram Mini App user ${input.userId}`,
  });

  await prisma.user.update({
    where: {
      id: input.userId,
    },
    data: {
      moySkladCounterpartyId: counterparty.id,
    },
  });

  return counterparty.id;
}

async function releaseCheckoutLocks(locks: CheckoutLock[]) {
  await Promise.all(
    locks.map((lock) => {
      return redisReleaseLock(lock.key, lock.value);
    }),
  );
}

async function acquireCheckoutLocks(productVariantIds: string[]) {
  const lockValue = randomUUID();
  const locks: CheckoutLock[] = [];
  const uniqueIds = Array.from(new Set(productVariantIds)).sort();

  for (const productVariantId of uniqueIds) {
    const key = `checkout:stock-lock:${productVariantId}`;
    const isLocked = await redisSetLock(key, lockValue, 30);

    if (!isLocked) {
      await releaseCheckoutLocks(locks);
      throw new CheckoutLockError();
    }

    locks.push({
      key,
      value: lockValue,
    });
  }

  return locks;
}

async function validateLiveStocks(orderItems: OrderItemDraft[]) {
  const stockByVariantId = new Map<string, number>();
  const uniqueVariantIds = Array.from(
    new Set(orderItems.map((item) => item.productVariantId)),
  );

  await Promise.all(
    uniqueVariantIds.map(async (productVariantId) => {
      const stock = await getMoySkladStockByAssortmentId(productVariantId);
      stockByVariantId.set(productVariantId, stock);
    }),
  );

  const stockErrors = orderItems
    .filter((item) => {
      return item.quantity > (stockByVariantId.get(item.productVariantId) ?? 0);
    })
    .map((item) => ({
      productVariantId: item.productVariantId,
      title: item.title,
      requestedQuantity: item.quantity,
      availableQuantity: stockByVariantId.get(item.productVariantId) ?? 0,
    }));

  if (stockErrors.length > 0) {
    throw new CartStockError(
      stockErrors.some((item) => item.availableQuantity > 0)
        ? "QUANTITY_EXCEEDED"
        : "OUT_OF_STOCK",
      stockErrors,
    );
  }
}

function isMoySkladStockError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /остат|stock|reserve|quantity|количеств|резерв/i.test(error.message);
}

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (request, reply) => {
    const user = await getCurrentUser(request);
    const body = (request.body ?? {}) as CreateOrderBody;
    const customerName = body.customerName?.trim() ?? "";
    const customerPhone = body.customerPhone?.trim() ?? "";
    let requestedVariantIds: string[] = [];

    if (!customerName) {
      return reply.status(400).send({
        message: "Введите имя",
      });
    }

    if (!customerPhone) {
      return reply.status(400).send({
        message: "Введите номер телефона",
      });
    }

    const phoneRegex = /^\+?[0-9\s\-()]{7,24}$/;

    if (!phoneRegex.test(customerPhone)) {
      return reply.status(400).send({
        message: "Введите корректный номер телефона",
      });
    }

    try {
      const cartItems = await prisma.cartItem.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          id: "asc",
        },
      });

      if (cartItems.length === 0) {
        throw new Error("CART_EMPTY");
      }

      requestedVariantIds = cartItems.map((item) => item.productVariantId);

      const orderItems: OrderItemDraft[] = [];
      const stockErrors: StockErrorItem[] = [];

      for (const item of cartItems) {
        const catalogItem = await findCatalogVariant(item.productVariantId);

        if (
          !catalogItem ||
          !catalogItem.product.isActive ||
          !catalogItem.variant.isActive ||
          catalogItem.variant.maxQuantity <= 0
        ) {
          stockErrors.push({
            productVariantId: item.productVariantId,
            title: catalogItem?.variant.title ?? "Товар недоступен",
            requestedQuantity: item.quantity,
            availableQuantity: 0,
          });
          continue;
        }

        if (item.quantity > catalogItem.variant.maxQuantity) {
          stockErrors.push({
            productVariantId: item.productVariantId,
            title: catalogItem.variant.title,
            requestedQuantity: item.quantity,
            availableQuantity: catalogItem.variant.maxQuantity,
          });
          continue;
        }

        orderItems.push({
          cartItemId: item.id,
          productVariantId: item.productVariantId,
          title: catalogItem.variant.title,
          quantity: item.quantity,
          price: catalogItem.variant.price,
          assortmentMeta: catalogItem.variant.meta,
        });
      }

      if (stockErrors.length > 0) {
        throw new CartStockError(
          stockErrors.some((item) => item.availableQuantity > 0)
            ? "QUANTITY_EXCEEDED"
            : "OUT_OF_STOCK",
          stockErrors,
        );
      }

      const locks = await acquireCheckoutLocks(requestedVariantIds);

      try {
        await validateLiveStocks(orderItems);

        const counterpartyId = await getOrCreateCounterparty({
          userId: user.id,
          customerName,
          customerPhone,
        });
        const order = await createMoySkladCustomerOrder({
          counterpartyId,
          description: `Telegram Mini App order for user ${user.id}`,
          positions: orderItems.map((item) => ({
            quantity: item.quantity,
            reserve: item.quantity,
            price: item.price * 100,
            assortmentMeta: item.assortmentMeta,
          })),
        });
        const totalPrice = orderItems.reduce((sum, item) => {
          return sum + item.price * item.quantity;
        }, 0);

        await prisma.cartItem.deleteMany({
          where: {
            userId: user.id,
            id: {
              in: orderItems.map((item) => item.cartItemId),
            },
          },
        });

        await refreshCatalogVariantStocks(requestedVariantIds);

        const remainingCartItems = await prisma.cartItem.findMany({
          where: {
            userId: user.id,
          },
          select: {
            quantity: true,
          },
        });
        const remainingCartCount = remainingCartItems.reduce((sum, item) => {
          return sum + item.quantity;
        }, 0);

        return reply.status(201).send({
          id: order.id,
          name: order.name,
          status: "CREATED",
          totalPrice,
          customerName,
          customerPhone,
          items: orderItems.map((item) => ({
            productVariantId: item.productVariantId,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
          remainingCartCount,
        });
      } finally {
        await releaseCheckoutLocks(locks);
      }
    } catch (error) {
      if (requestedVariantIds.length > 0) {
        try {
          await refreshCatalogVariantStocks(requestedVariantIds);
        } catch {
          // The order response should reflect the checkout failure, not cache refresh.
        }
      }

      if (error instanceof CartStockError) {
        return reply.status(409).send({
          code: error.code,
          message:
            error.code === "QUANTITY_EXCEEDED"
              ? "Некоторых товаров нет в нужном количестве"
              : "Некоторые товары закончились",
          items: error.items,
        });
      }

      if (error instanceof CheckoutLockError) {
        return reply.status(409).send({
          code: "CHECKOUT_IN_PROGRESS",
          message: "Товар уже оформляют, попробуйте еще раз через несколько секунд",
        });
      }

      if (error instanceof Error && error.message === "CART_EMPTY") {
        return reply.status(400).send({
          message: "Корзина пустая",
        });
      }

      if (isMoySkladStockError(error)) {
        return reply.status(409).send({
          code: "OUT_OF_STOCK",
          message: "Некоторые товары закончились",
          items: [],
        });
      }

      throw error;
    }
  });
};
