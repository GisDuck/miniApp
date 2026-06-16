import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";

type ProfileOrderStatus =
  | "created"
  | "assembled"
  | "in_delivery"
  | "waiting_pickup"
  | "received";

type ProfileOrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: {
            id: true;
            imageUrl: true;
          };
        };
      };
    };
  };
}>;

function normalizeOrderStatus(status: string): ProfileOrderStatus {
  const normalizedStatus = status.trim().toLowerCase();

  switch (normalizedStatus) {
    case "new":
    case "created":
    case "оформлен":
      return "created";

    case "assembled":
    case "собран":
      return "assembled";

    case "in_delivery":
    case "delivery":
    case "в доставке":
      return "in_delivery";

    case "waiting_pickup":
    case "waiting":
    case "ожидает получения":
      return "waiting_pickup";

    case "received":
    case "получен":
      return "received";

    default:
      return "created";
  }
}

function mapProfileOrder(order: ProfileOrderWithItems) {
  const items = order.items.map((item) => {
    const price = Number(item.priceSnapshot);
    const quantity = Number(item.quantity);

    return {
      id: item.id,
      productId: item.productId,
      title: item.titleSnapshot,
      quantity,
      price,
      imageUrl: item.product.imageUrl,
      totalPrice: price * quantity,
    };
  });

  const totalPrice = Number(order.totalPrice);

  return {
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    status: normalizeOrderStatus(order.status),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items,
    totalPrice,
  };
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const user = await getCurrentUser(request);

    const ordersFromDb = await prisma.order.findMany({
      where: {
        userId: user.id,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const orders = ordersFromDb.map(mapProfileOrder);
    const currentOrders = orders.filter((order) => order.status !== "received");
    const historyOrders = orders.filter((order) => order.status === "received");

    return {
      currentOrders,
      historyOrders,
    };
  });
};
