import type { FastifyPluginAsync } from "fastify";

import { findCatalogVariant } from "../services/catalog.service";
import {
  getMoySkladCustomerOrderPositions,
  getMoySkladCustomerOrdersByCounterparty,
  type MoySkladCustomerOrder,
} from "../services/moysklad.service";
import { getCurrentUser } from "../services/user.service";

type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

const CURRENT_ORDER_STATUSES: OrderStatus[] = [
  "CREATED",
  "PREPARING",
  "DELIVERING",
  "READY_FOR_PICKUP",
];

function getStatus(order: MoySkladCustomerOrder): OrderStatus {
  const stateHref = order.state?.meta?.href;
  const stateName = order.state?.name?.toLowerCase() ?? "";
  const stateByHref: Array<[string | undefined, OrderStatus]> = [
    [process.env.MOYSKLAD_ORDER_CREATED_STATE_HREF, "CREATED"],
    [process.env.MOYSKLAD_ORDER_PREPARING_STATE_HREF, "PREPARING"],
    [process.env.MOYSKLAD_ORDER_DELIVERING_STATE_HREF, "DELIVERING"],
    [process.env.MOYSKLAD_ORDER_READY_STATE_HREF, "READY_FOR_PICKUP"],
    [process.env.MOYSKLAD_ORDER_COMPLETED_STATE_HREF, "COMPLETED"],
    [process.env.MOYSKLAD_ORDER_CANCELED_STATE_HREF, "CANCELED"],
  ];
  const matchedState = stateByHref.find(([href]) => href && href === stateHref);

  if (matchedState) {
    return matchedState[1];
  }

  if (stateName.includes("отмен") || stateName.includes("cancel")) {
    return "CANCELED";
  }

  if (stateName.includes("заверш") || stateName.includes("complete")) {
    return "COMPLETED";
  }

  const sum = order.sum ?? 0;
  const shippedSum = order.shippedSum ?? 0;

  if (sum > 0 && shippedSum >= sum) {
    return "COMPLETED";
  }

  return "CREATED";
}

async function mapProfileOrder(order: MoySkladCustomerOrder) {
  const positions = await getMoySkladCustomerOrderPositions(order);
  const items = await Promise.all(
    positions.map(async (position, index) => {
      const variantId = position.assortment?.id ?? position.assortment?.meta.href.split("/").pop();
      const catalogItem = variantId ? await findCatalogVariant(variantId) : null;
      const product = catalogItem?.product;
      const variant = catalogItem?.variant;
      const price = Math.round((position.price ?? 0) / 100);
      const quantity = position.quantity ?? 0;

      return {
        id: position.id ?? `${order.id}-${index}`,
        productId: product?.productId ?? null,
        productVariantId: variantId ?? null,
        title: variant?.title ?? position.assortment?.name ?? "Товар",
        quantity,
        price,
        imageUrl: variant?.imageUrl ?? null,
        totalPrice: price * quantity,
      };
    }),
  );
  const previewImages = items
    .map((item) => item.imageUrl)
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));

  return {
    id: order.id,
    name: order.name,
    createdAt: new Date(order.created ?? order.moment ?? Date.now()).toISOString(),
    updatedAt: new Date(order.updated ?? order.created ?? Date.now()).toISOString(),
    status: getStatus(order),
    items,
    itemsCount: items.length,
    previewImages:
      previewImages.length >= 5 ? previewImages.slice(0, 3) : previewImages.slice(0, 4),
    totalPrice: Math.round((order.sum ?? 0) / 100),
  };
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const user = await getCurrentUser(request);

    if (!user.moySkladCounterpartyId) {
      request.log.info(
        {
          userId: user.id,
        },
        "profile_orders_skipped_without_counterparty",
      );
      return {
        currentOrders: [],
        historyOrders: [],
      };
    }

    request.log.info(
      {
        userId: user.id,
        counterpartyId: user.moySkladCounterpartyId,
      },
      "profile_orders_fetch_started",
    );

    let ordersFromMoySklad: MoySkladCustomerOrder[];

    try {
      ordersFromMoySklad = await getMoySkladCustomerOrdersByCounterparty(
        user.moySkladCounterpartyId,
      );
    } catch (error) {
      request.log.error(
        {
          err: error,
          userId: user.id,
          counterpartyId: user.moySkladCounterpartyId,
        },
        "profile_orders_fetch_failed",
      );
      throw error;
    }

    const orders = await Promise.all(ordersFromMoySklad.map(mapProfileOrder));
    const currentOrders = orders.filter((order) =>
      CURRENT_ORDER_STATUSES.includes(order.status),
    );
    const historyOrders = orders.filter((order) => {
      return !CURRENT_ORDER_STATUSES.includes(order.status);
    });

    request.log.info(
      {
        userId: user.id,
        ordersCount: orders.length,
        currentOrdersCount: currentOrders.length,
        historyOrdersCount: historyOrders.length,
      },
      "profile_orders_fetch_completed",
    );

    return {
      currentOrders,
      historyOrders,
    };
  });
};
