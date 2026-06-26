import { OrderStatus } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import type { CreateOrderBody } from "../types/order.types";

type StockErrorCode = "OUT_OF_STOCK" | "QUANTITY_EXCEEDED";

type StockErrorItem = {
  productVariantId: number;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
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

function mapStockErrorItem(
  item: {
    productVariantId: number;
    quantity: number;
    productVariant: {
      title: string;
      maxQuantity: number;
      isActive: boolean;
      product: {
        isActive: boolean;
      };
    };
  },
  availableQuantity: number,
) {
  return {
    productVariantId: item.productVariantId,
    title: item.productVariant.title,
    requestedQuantity: item.quantity,
    availableQuantity,
  };
}

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (request, reply) => {
    const user = await getCurrentUser(request);
    const body = (request.body ?? {}) as CreateOrderBody;

    const customerName = body.customerName?.trim() ?? "";
    const customerPhone = body.customerPhone?.trim() ?? "";

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
      const order = await prisma.$transaction(async (tx) => {
        const cartItems = await tx.cartItem.findMany({
          where: {
            userId: user.id,
          },
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        });

        if (cartItems.length === 0) {
          throw new Error("CART_EMPTY");
        }

        const outOfStockItems = cartItems.filter((item) => {
          return (
            !item.productVariant.isActive ||
            !item.productVariant.product.isActive ||
            item.productVariant.maxQuantity <= 0
          );
        });

        const quantityIssueItems = cartItems.filter((item) => {
          return (
            item.productVariant.isActive &&
            item.productVariant.product.isActive &&
            item.productVariant.maxQuantity > 0 &&
            item.quantity > item.productVariant.maxQuantity
          );
        });

        if (quantityIssueItems.length > 0) {
          throw new CartStockError(
            "QUANTITY_EXCEEDED",
            quantityIssueItems.map((item) =>
              mapStockErrorItem(item, item.productVariant.maxQuantity),
            ),
          );
        }

        const availableCartItems = cartItems.filter((item) => {
          return (
            item.productVariant.isActive &&
            item.productVariant.product.isActive &&
            item.productVariant.maxQuantity > 0 &&
            item.quantity <= item.productVariant.maxQuantity
          );
        });

        if (availableCartItems.length === 0) {
          throw new CartStockError(
            "OUT_OF_STOCK",
            outOfStockItems.map((item) => mapStockErrorItem(item, 0)),
          );
        }

        const totalPrice = availableCartItems.reduce((sum, item) => {
          return sum + item.productVariant.price * item.quantity;
        }, 0);

        for (const item of availableCartItems) {
          const updatedRows = await tx.$executeRaw`
            UPDATE "ProductVariant"
            SET "maxQuantity" = "maxQuantity" - ${item.quantity},
                "updatedAt" = NOW()
            WHERE "id" = ${item.productVariantId}
              AND "isActive" = true
              AND "maxQuantity" >= ${item.quantity}
              AND EXISTS (
                SELECT 1
                FROM "Product"
                WHERE "Product"."id" = "ProductVariant"."productId"
                  AND "Product"."isActive" = true
              )
          `;

          if (updatedRows !== 1) {
            const freshVariant = await tx.productVariant.findUnique({
              where: {
                id: item.productVariantId,
              },
              include: {
                product: true,
              },
            });

            const availableQuantity =
              freshVariant?.isActive && freshVariant.product.isActive
                ? freshVariant.maxQuantity
                : 0;

            throw new CartStockError(
              availableQuantity > 0 ? "QUANTITY_EXCEEDED" : "OUT_OF_STOCK",
              [
                {
                  productVariantId: item.productVariantId,
                  title: freshVariant?.title ?? item.productVariant.title,
                  requestedQuantity: item.quantity,
                  availableQuantity,
                },
              ],
            );
          }
        }

        const createdOrder = await tx.order.create({
          data: {
            userId: user.id,
            status: OrderStatus.CREATED,
            customerName,
            customerPhone,
            totalPrice,
            items: {
              create: availableCartItems.map((item) => ({
                productVariantId: item.productVariantId,
                variantTitleSnapshot: item.productVariant.title,
                priceSnapshot: item.productVariant.price,
                quantity: item.quantity,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        await tx.cartItem.deleteMany({
          where: {
            userId: user.id,
            productVariantId: {
              in: availableCartItems.map((item) => item.productVariantId),
            },
          },
        });

        const remainingCartItems = await tx.cartItem.findMany({
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

        return {
          ...createdOrder,
          remainingCartCount,
        };
      });

      return reply.status(201).send({
        id: order.id,
        status: order.status,
        totalPrice: order.totalPrice,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: order.items,
        remainingCartCount: order.remainingCartCount,
      });
    } catch (error) {
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

      if (error instanceof Error && error.message === "CART_EMPTY") {
        return reply.status(400).send({
          message: "Корзина пустая",
        });
      }

      if (
        error instanceof Error &&
        error.message === "CART_AVAILABLE_ITEMS_EMPTY_LEGACY"
      ) {
        return reply.status(400).send({
          message: "В корзине нет товаров в наличии",
        });
      }

      if (
        error instanceof Error &&
        error.message === "CART_AVAILABLE_ITEMS_EMPTY"
      ) {
        return reply.status(400).send({
          message: "В корзине нет товаров в наличии",
        });
      }

      if (
        error instanceof Error &&
        error.message === "PRODUCT_VARIANT_UNAVAILABLE"
      ) {
        return reply.status(400).send({
          message: "Один из товаров больше недоступен",
        });
      }

      if (
        error instanceof Error &&
        error.message === "PRODUCT_VARIANT_OUT_OF_STOCK"
      ) {
        return reply.status(400).send({
          message: "Один из товаров уже раскупили",
        });
      }

      throw error;
    }
  });
};
