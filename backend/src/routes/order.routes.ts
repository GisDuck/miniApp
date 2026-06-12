import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";
import type { CreateOrderBody } from "../types/order.types";

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
            product: true,
          },
          orderBy: {
            id: "asc",
          },
        });

        if (cartItems.length === 0) {
          throw new Error("CART_EMPTY");
        }

        const totalPrice = cartItems.reduce((sum, item) => {
          return sum + item.product.price * item.quantity;
        }, 0);

        const createdOrder = await tx.order.create({
          data: {
            userId: user.id,
            customerName,
            customerPhone,
            totalPrice,
            items: {
              create: cartItems.map((item) => ({
                productId: item.productId,
                titleSnapshot: item.product.title,
                priceSnapshot: item.product.price,
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
          },
        });

        return createdOrder;
      });

      return reply.status(201).send({
        id: order.id,
        status: order.status,
        totalPrice: order.totalPrice,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: order.items,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CART_EMPTY") {
        return reply.status(400).send({
          message: "Корзина пустая",
        });
      }

      throw error;
    }
  });
};