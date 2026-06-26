import { OrderStatus } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../services/user.service";

const CURRENT_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PREPARING,
  OrderStatus.DELIVERING,
  OrderStatus.READY_FOR_PICKUP,
];

const HISTORY_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELED,
];

type ProfileOrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        productVariant: {
          include: {
            images: true;
          };
        };
      };
    };
  };
}>;

function mapProfileOrder(order: ProfileOrderWithItems) {
  const items = order.items.map((item) => {
    const image = item.productVariant?.images[0];

    return {
      id: item.id,
      productId: item.productVariant?.productId ?? null,
      productVariantId: item.productVariantId,
      title: item.variantTitleSnapshot,
      quantity: item.quantity,
      price: item.priceSnapshot,
      imageUrl: image?.url ?? null,
      totalPrice: item.priceSnapshot * item.quantity,
    };
  });

  const previewImages = items
    .map((item) => item.imageUrl)
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));

  return {
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items,
    itemsCount: items.length,
    previewImages:
      previewImages.length >= 5 ? previewImages.slice(0, 3) : previewImages.slice(0, 4),
    totalPrice: order.totalPrice,
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
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const orders = ordersFromDb.map(mapProfileOrder);
    const currentOrders = orders.filter((order) =>
      CURRENT_ORDER_STATUSES.includes(order.status),
    );
    const historyOrders = orders.filter((order) =>
      HISTORY_ORDER_STATUSES.includes(order.status),
    );

    return {
      currentOrders,
      historyOrders,
    };
  });
};
