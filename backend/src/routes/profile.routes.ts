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

const MOYSKLAD_STATE_STATUS_BY_ID: Record<string, OrderStatus> = {
  "70b3aebd-6fee-11f1-0a80-1f7d0000475b": "CREATED",
  "8c5b175c-720d-11f1-0a80-077700365eee": "CREATED",
  "8c5ebc06-720d-11f1-0a80-077700365ef1": "CREATED",
  "70b3b11d-6fee-11f1-0a80-1f7d0000475d": "PREPARING",
  "5e07bd22-727c-11f1-0a80-0e7c001c808a": "DELIVERING",
  "70b3b3ad-6fee-11f1-0a80-1f7d0000475e": "READY_FOR_PICKUP",
  "70b3b447-6fee-11f1-0a80-1f7d0000475f": "READY_FOR_PICKUP",
  "5e07c59a-727c-11f1-0a80-0e7c001c808b": "COMPLETED",
  "70b3b4bb-6fee-11f1-0a80-1f7d00004760": "CANCELED",
  "70b3b536-6fee-11f1-0a80-1f7d00004761": "CANCELED",
  "8c60a56f-720d-11f1-0a80-077700365ef3": "CANCELED",
  "8c624c57-720d-11f1-0a80-077700365ef5": "CANCELED",
};

const MOYSKLAD_STATE_STATUS_BY_NAME: Record<string, OrderStatus> = {
  "новый": "CREATED",
  "платеж авторизован": "CREATED",
  "оплачен": "CREATED",
  "собран": "PREPARING",
  "в доставке": "DELIVERING",
  "ждет самовывоз": "READY_FOR_PICKUP",
  "ждет в пвз": "READY_FOR_PICKUP",
  "завершен": "COMPLETED",
  "возврат": "CANCELED",
  "отменен": "CANCELED",
  "отклонен": "CANCELED",
  "частичный возврат": "CANCELED",
};

function getStateId(stateHref: string | undefined) {
  return stateHref?.split("/").filter(Boolean).pop();
}

function normalizeStateName(stateName: string | undefined) {
  return stateName?.trim().toLowerCase().replace(/ё/g, "е") ?? "";
}

function envStateMatches(
  envValue: string | undefined,
  stateHref: string | undefined,
  stateId: string | undefined,
) {
  if (!envValue) {
    return false;
  }

  return envValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .some((value) => {
      return (
        value === stateHref ||
        value === stateId ||
        Boolean(stateId && value.endsWith(`/${stateId}`))
      );
    });
}

function getEnvMappedStatus(
  stateHref: string | undefined,
  stateId: string | undefined,
): OrderStatus | null {
  const stateByHref: Array<[string | undefined, OrderStatus]> = [
    [process.env.MOYSKLAD_ORDER_CREATED_STATE_HREF, "CREATED"],
    [process.env.MOYSKLAD_ORDER_PREPARING_STATE_HREF, "PREPARING"],
    [process.env.MOYSKLAD_ORDER_DELIVERING_STATE_HREF, "DELIVERING"],
    [process.env.MOYSKLAD_ORDER_READY_STATE_HREF, "READY_FOR_PICKUP"],
    [process.env.MOYSKLAD_ORDER_COMPLETED_STATE_HREF, "COMPLETED"],
    [process.env.MOYSKLAD_ORDER_CANCELED_STATE_HREF, "CANCELED"],
  ];
  const matchedState = stateByHref.find(([href]) =>
    envStateMatches(href, stateHref, stateId),
  );

  return matchedState?.[1] ?? null;
}

function getStatus(order: MoySkladCustomerOrder): OrderStatus {
  const stateHref = order.state?.meta?.href;
  const stateId = getStateId(stateHref);
  const stateName = normalizeStateName(order.state?.name);

  if (stateId && MOYSKLAD_STATE_STATUS_BY_ID[stateId]) {
    return MOYSKLAD_STATE_STATUS_BY_ID[stateId];
  }

  const envStatus = getEnvMappedStatus(stateHref, stateId);

  if (envStatus) {
    return envStatus;
  }

  if (MOYSKLAD_STATE_STATUS_BY_NAME[stateName]) {
    return MOYSKLAD_STATE_STATUS_BY_NAME[stateName];
  }

  if (
    stateName.includes("отмен") ||
    stateName.includes("возврат") ||
    stateName.includes("отклон") ||
    stateName.includes("cancel") ||
    stateName.includes("return") ||
    stateName.includes("reject")
  ) {
    return "CANCELED";
  }

  if (stateName.includes("заверш") || stateName.includes("complete")) {
    return "COMPLETED";
  }

  if (stateName.includes("достав")) {
    return "DELIVERING";
  }

  if (stateName.includes("самовывоз") || stateName.includes("пвз")) {
    return "READY_FOR_PICKUP";
  }

  if (stateName.includes("собран")) {
    return "PREPARING";
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
