import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { findCatalogVariant } from "./catalog.service";
import {
  getMoySkladCustomerOrderDeliveryType,
  getMoySkladCustomerOrderPositions,
  getMoySkladCustomerOrdersByCounterpartyWithDetails,
  type MoySkladCustomerOrder,
} from "./moysklad.service";

export type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

type Logger = {
  info: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};

const CURRENT_ORDER_STATUSES: OrderStatus[] = [
  "CREATED",
  "PREPARING",
  "DELIVERING",
  "READY_FOR_PICKUP",
];
const CANCELED_CURRENT_TTL_MS = 12 * 60 * 60 * 1000;

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
  "внесли изменения": "PREPARING",
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

const cachedOrderInclude = {
  items: {
    orderBy: {
      sortOrder: "asc",
    },
  },
} satisfies Prisma.OrderInclude;

type CachedOrder = Prisma.OrderGetPayload<{
  include: typeof cachedOrderInclude;
}>;

type PickupReservation = Prisma.PickupSlotReservationGetPayload<{
  include: {
    pickupAddress: true;
  };
}>;

function getStateId(stateHref: string | undefined) {
  return stateHref?.split("/").filter(Boolean).pop();
}

function normalizeText(value: string | undefined | null) {
  return value?.trim().toLowerCase().replace(/ё/g, "е") ?? "";
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
    [process.env.MOYSKLAD_ORDER_CHANGED_STATE_HREF, "PREPARING"],
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

export function getStatus(order: MoySkladCustomerOrder): OrderStatus {
  const stateHref = order.state?.meta?.href;
  const stateId = getStateId(stateHref);
  const stateName = normalizeText(order.state?.name);

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

  if (stateName.includes("собран") || stateName.includes("внесли измен")) {
    return "PREPARING";
  }

  return "CREATED";
}

function getDeliveryMethodCodeFromType(deliveryType: string | null) {
  const normalizedType = normalizeText(deliveryType);

  if (
    normalizedType.includes("самовывоз") ||
    normalizedType.includes("СЃР°РјРѕРІС‹РІРѕР·")
  ) {
    return "pickup";
  }

  if (
    normalizedType.includes("cdek") ||
    normalizedType.includes("сдек") ||
    normalizedType.includes("СЃРґРµРє")
  ) {
    return "cdek";
  }

  if (
    normalizedType.includes("яндекс") ||
    normalizedType.includes("СЏРЅРґРµРєСЃ")
  ) {
    return "yandex_express";
  }

  return null;
}

function normalizeDeliveryTypeValue(deliveryType: string | null) {
  const normalizedType = normalizeText(deliveryType);

  if (
    normalizedType.includes("самовывоз") ||
    normalizedType.includes("СЃР°РјРѕРІС‹РІРѕР·")
  ) {
    return "Самовывоз";
  }

  if (
    normalizedType.includes("доставка яндекс") ||
    normalizedType.includes("РґРѕСЃС‚Р°РІРєР° СЏРЅРґРµРєСЃ")
  ) {
    return "Доставка Яндекс";
  }

  return deliveryType;
}

function getOrderAttributeString(order: MoySkladCustomerOrder, attributeName: string) {
  const normalizedAttributeName = normalizeText(attributeName);
  const attribute = order.attributes?.find((item) => {
    return normalizeText(item.name) === normalizedAttributeName;
  });

  return typeof attribute?.value === "string" ? attribute.value : null;
}

function getMoySkladCustomerOrderPaymentTypeValue(order: MoySkladCustomerOrder) {
  return getOrderAttributeString(
    order,
    process.env.MOYSKLAD_ORDER_PAYMENT_TYPE_ATTRIBUTE_NAME ?? "Тип оплаты",
  );
}

function getMoySkladCustomerOrderReceivingAddressValue(
  order: MoySkladCustomerOrder,
) {
  return getOrderAttributeString(
    order,
    process.env.MOYSKLAD_ORDER_RECEIVING_ADDRESS_ATTRIBUTE_NAME ??
      "Адрес получения",
  );
}

function parseMoySkladDate(value: string | undefined, fallback = new Date()) {
  if (!value) {
    return fallback;
  }

  const normalizedValue = value.includes(" ") ? value.replace(" ", "T") : value;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? fallback : date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatPickupTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}

function getEditState(input: {
  status: OrderStatus;
  deliveryMethodCode: string | null;
}) {
  if (input.status === "COMPLETED") {
    return {
      canEdit: false,
      editDisabledReason: "Заказ завершён",
    };
  }

  if (input.status === "CANCELED") {
    return {
      canEdit: false,
      editDisabledReason: "Заказ отменён",
    };
  }

  if (
    input.status === "DELIVERING" &&
    input.deliveryMethodCode !== "pickup"
  ) {
    return {
      canEdit: false,
      editDisabledReason: "Заказ уже в доставке",
    };
  }

  return {
    canEdit: true,
    editDisabledReason: null,
  };
}

export function isCurrentCachedOrder(order: {
  status: string;
  moySkladUpdatedAt: Date;
}) {
  if (CURRENT_ORDER_STATUSES.includes(order.status as OrderStatus)) {
    return true;
  }

  if (order.status !== "CANCELED") {
    return false;
  }

  return Date.now() - order.moySkladUpdatedAt.getTime() < CANCELED_CURRENT_TTL_MS;
}

async function getPickupReservationsByOrderIds(orderIds: string[]) {
  const reservations = await prisma.pickupSlotReservation.findMany({
    where: {
      moySkladOrderId: {
        in: orderIds,
      },
    },
    include: {
      pickupAddress: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  const reservationByOrderId = new Map<string, PickupReservation>();

  for (const reservation of reservations) {
    if (
      reservation.moySkladOrderId &&
      !reservationByOrderId.has(reservation.moySkladOrderId)
    ) {
      reservationByOrderId.set(reservation.moySkladOrderId, reservation);
    }
  }

  return reservationByOrderId;
}

export function mapCachedOrder(
  order: CachedOrder,
  pickupReservation?: PickupReservation,
) {
  const items = order.items.map((item) => ({
    id: String(item.id),
    productId: item.productId,
    productVariantId: item.productVariantId,
    title: item.title,
    quantity: item.quantity,
    price: item.price,
    imageUrl: item.imageUrl,
    totalPrice: item.price * item.quantity,
  }));
  const previewImages = items
    .map((item) => item.imageUrl)
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
  const status = order.status as OrderStatus;
  const editState = getEditState({
    status,
    deliveryMethodCode: order.deliveryMethodCode,
  });

  return {
    id: order.moySkladOrderId,
    name: order.moySkladOrderName,
    createdAt: order.moySkladCreatedAt.toISOString(),
    updatedAt: order.moySkladUpdatedAt.toISOString(),
    status,
    stateName: order.stateName,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryType: order.deliveryType,
    deliveryMethodCode: order.deliveryMethodCode,
    paymentType: order.paymentType,
    receivingAddress:
      order.receivingAddress ?? pickupReservation?.pickupAddress.address ?? null,
    pickupDateTime: order.pickupDateTime?.toISOString() ?? null,
    canEdit: editState.canEdit,
    editDisabledReason: editState.editDisabledReason,
    pickupReservation: pickupReservation
      ? {
          pickupAddressId: pickupReservation.pickupAddressId,
          pickupAddress: {
            id: pickupReservation.pickupAddress.id,
            address: pickupReservation.pickupAddress.address,
            description: pickupReservation.pickupAddress.description,
          },
          pickupDate: formatDate(pickupReservation.pickupDate),
          pickupTime: formatPickupTime(pickupReservation.pickupTimeMinutes),
        }
      : null,
    items,
    itemsCount: items.length,
    previewImages:
      previewImages.length >= 5 ? previewImages.slice(0, 3) : previewImages.slice(0, 4),
    totalPrice: order.totalPrice,
  };
}

export async function getCachedProfileOrders(userId: number) {
  const orders = await prisma.order.findMany({
    where: {
      userId,
    },
    include: cachedOrderInclude,
    orderBy: {
      moySkladCreatedAt: "desc",
    },
  });
  const reservationByOrderId = await getPickupReservationsByOrderIds(
    orders.map((order) => order.moySkladOrderId),
  );

  return orders.map((order) =>
    mapCachedOrder(order, reservationByOrderId.get(order.moySkladOrderId)),
  );
}

export async function getCachedProfileOrder(userId: number, orderId: string) {
  const order = await prisma.order.findFirst({
    where: {
      userId,
      moySkladOrderId: orderId,
    },
    include: cachedOrderInclude,
  });

  if (!order) {
    return null;
  }

  const reservationByOrderId = await getPickupReservationsByOrderIds([
    order.moySkladOrderId,
  ]);

  return mapCachedOrder(order, reservationByOrderId.get(order.moySkladOrderId));
}

function getOrderCounterpartyId(order: MoySkladCustomerOrder) {
  return order.agent?.id ?? order.agent?.meta?.href.split("/").pop() ?? null;
}

export async function upsertCachedOrderFromMoySklad(input: {
  order: MoySkladCustomerOrder;
  userId?: number;
  overrides?: {
    customerName?: string;
    customerPhone?: string;
    deliveryType?: string | null;
    deliveryMethodCode?: string | null;
    paymentType?: string | null;
    receivingAddress?: string | null;
    pickupDateTime?: Date | null;
  };
}) {
  const counterpartyId = getOrderCounterpartyId(input.order);
  const user =
    input.userId !== undefined
      ? await prisma.user.findUnique({
          where: {
            id: input.userId,
          },
          select: {
            id: true,
          },
        })
      : counterpartyId
        ? await prisma.user.findUnique({
            where: {
              moySkladCounterpartyId: counterpartyId,
            },
            select: {
              id: true,
            },
          })
        : null;

  if (!user) {
    return null;
  }

  const positions = await getMoySkladCustomerOrderPositions(input.order);
  const deliveryType =
    input.overrides?.deliveryType ??
    normalizeDeliveryTypeValue(getMoySkladCustomerOrderDeliveryType(input.order));
  const deliveryMethodCode =
    input.overrides?.deliveryMethodCode ?? getDeliveryMethodCodeFromType(deliveryType);
  const status = getStatus(input.order);
  const fallbackDate = new Date();
  const createdAt = parseMoySkladDate(
    input.order.created ?? input.order.moment,
    fallbackDate,
  );
  const updatedAt = parseMoySkladDate(
    input.order.updated ?? input.order.created ?? input.order.moment,
    createdAt,
  );
  const pickupDateTime =
    input.overrides && "pickupDateTime" in input.overrides
      ? input.overrides.pickupDateTime ?? null
      : input.order.deliveryPlannedMoment
        ? parseMoySkladDate(input.order.deliveryPlannedMoment)
        : null;
  const items = await Promise.all(
    positions.map(async (position, index) => {
      const productVariantId =
        position.assortment?.id ?? position.assortment?.meta.href.split("/").pop();
      const catalogItem = productVariantId
        ? await findCatalogVariant(productVariantId)
        : null;
      const price = Math.round((position.price ?? 0) / 100);
      const quantity = Math.trunc(position.quantity ?? 0);

      return {
        productId: catalogItem?.product.productId ?? null,
        productVariantId: productVariantId ?? null,
        title: catalogItem?.variant.title ?? position.assortment?.name ?? "Товар",
        quantity,
        price,
        imageUrl: catalogItem?.variant.imageUrl ?? null,
        sortOrder: index,
      };
    }),
  );
  const orderData = {
    userId: user.id,
    moySkladOrderName: input.order.name,
    status,
    stateName: input.order.state?.name ?? null,
    customerName: input.overrides?.customerName ?? input.order.agent?.name ?? "",
    customerPhone: input.overrides?.customerPhone ?? input.order.agent?.phone ?? "",
    deliveryType,
    deliveryMethodCode,
    paymentType:
      input.overrides?.paymentType ??
      getMoySkladCustomerOrderPaymentTypeValue(input.order),
    receivingAddress:
      input.overrides?.receivingAddress ??
      getMoySkladCustomerOrderReceivingAddressValue(input.order),
    pickupDateTime,
    totalPrice: Math.round((input.order.sum ?? 0) / 100),
    moySkladCreatedAt: createdAt,
    moySkladUpdatedAt: updatedAt,
  };

  return prisma.$transaction(async (tx) => {
    const savedOrder = await tx.order.upsert({
      where: {
        moySkladOrderId: input.order.id,
      },
      create: {
        moySkladOrderId: input.order.id,
        ...orderData,
      },
      update: orderData,
    });

    await tx.orderItem.deleteMany({
      where: {
        orderId: savedOrder.id,
      },
    });

    if (items.length > 0) {
      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId: savedOrder.id,
          ...item,
        })),
      });
    }

    return tx.order.findUniqueOrThrow({
      where: {
        id: savedOrder.id,
      },
      include: cachedOrderInclude,
    });
  });
}

export async function updateCachedOrderStatusFromMoySklad(
  order: MoySkladCustomerOrder,
) {
  const existingOrder = await prisma.order.findUnique({
    where: {
      moySkladOrderId: order.id,
    },
    include: cachedOrderInclude,
  });

  if (!existingOrder) {
    return null;
  }

  const updatedAt = parseMoySkladDate(
    order.updated ?? order.created ?? order.moment,
    existingOrder.moySkladUpdatedAt,
  );
  const deliveryType = normalizeDeliveryTypeValue(
    getMoySkladCustomerOrderDeliveryType(order),
  );
  const paymentType = getMoySkladCustomerOrderPaymentTypeValue(order);
  const receivingAddress = getMoySkladCustomerOrderReceivingAddressValue(order);
  const pickupDateTime = order.deliveryPlannedMoment
    ? parseMoySkladDate(order.deliveryPlannedMoment)
    : null;
  const updatedOrder = await prisma.order.update({
    where: {
      id: existingOrder.id,
    },
    data: {
      moySkladOrderName: order.name ?? existingOrder.moySkladOrderName,
      status: getStatus(order),
      stateName: order.state?.name ?? existingOrder.stateName,
      customerName: order.agent?.name ?? existingOrder.customerName,
      customerPhone: order.agent?.phone ?? existingOrder.customerPhone,
      ...(deliveryType !== null
        ? {
            deliveryType,
            deliveryMethodCode: getDeliveryMethodCodeFromType(deliveryType),
          }
        : {}),
      ...(paymentType !== null
        ? {
            paymentType,
          }
        : {}),
      ...(receivingAddress !== null
        ? {
            receivingAddress,
          }
        : {}),
      ...(order.deliveryPlannedMoment !== undefined
        ? {
            pickupDateTime,
          }
        : {}),
      ...(order.sum !== undefined
        ? {
            totalPrice: Math.round(order.sum / 100),
          }
        : {}),
      moySkladUpdatedAt: updatedAt,
    },
    include: cachedOrderInclude,
  });

  return updatedOrder;
}

export async function syncCachedOrdersIfEmpty(logger: Logger) {
  const ordersCount = await prisma.order.count();

  if (ordersCount > 0) {
    logger.info({ ordersCount }, "order_cache_startup_sync_skipped");
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      moySkladCounterpartyId: {
        not: null,
      },
    },
    select: {
      id: true,
      moySkladCounterpartyId: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  logger.info(
    {
      usersCount: users.length,
    },
    "order_cache_startup_sync_started",
  );

  let syncedOrdersCount = 0;

  for (const user of users) {
    if (!user.moySkladCounterpartyId) {
      continue;
    }

    const orders = await getMoySkladCustomerOrdersByCounterpartyWithDetails(
      user.moySkladCounterpartyId,
    );

    for (const order of orders) {
      await upsertCachedOrderFromMoySklad({
        order,
        userId: user.id,
      });
      syncedOrdersCount += 1;
    }
  }

  logger.info(
    {
      usersCount: users.length,
      syncedOrdersCount,
    },
    "order_cache_startup_sync_completed",
  );
}
