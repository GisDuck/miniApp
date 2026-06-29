import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { findCatalogVariant } from "../services/catalog.service";
import {
  getMoySkladCustomerOrder,
  getMoySkladCustomerOrderDeliveryType,
  getMoySkladCustomerOrderPositions,
  getMoySkladCustomerOrdersByCounterparty,
  getMoySkladOrderCanceledStateMeta,
  getMoySkladOrderPreparingStateMeta,
  updateMoySkladCounterpartyContact,
  updateMoySkladCustomerOrder,
  type MoySkladCustomerOrder,
} from "../services/moysklad.service";
import { getCurrentUser } from "../services/user.service";
import {
  cleanupExpiredPickupReservations,
  ensureDeliveryAndPaymentMethods,
  getPickupDateWindow,
  getPickupReservationExpiresAt,
  isPickupSlotLeadTimeAvailable,
} from "./delivery.routes";

type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

type EditOrderBody = {
  customerName?: string;
  customerPhone?: string;
  deliveryMethodCode?: string;
  pickupAddressId?: number | string | null;
  pickupDate?: string;
  pickupTime?: string;
};

type DeliverySelection = {
  method: {
    code: string;
    title: string;
  };
  pickupAddress?: {
    id: number;
    title: string;
    address: string;
    description: string | null;
  };
  pickupDate?: Date;
  pickupDateText?: string;
  pickupTimeMinutes?: number;
  pickupTimeText?: string;
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

class PickupSlotUnavailableError extends Error {
  constructor() {
    super("PICKUP_SLOT_UNAVAILABLE");
  }
}

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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parsePickupDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePickupTime(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatPickupTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}

function buildMoySkladDateTime(date: Date, timeMinutes: number) {
  const dateTime = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      timeMinutes,
    ),
  );

  return `${formatDate(dateTime)} ${formatPickupTime(
    dateTime.getUTCHours() * 60 + dateTime.getUTCMinutes(),
  )}:00.000`;
}

function cleanOrderComment(description?: string) {
  return (description ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^TgMiniApp order for user\b/i.test(line.trim()))
    .join("\n")
    .trim();
}

function extractPaymentLines(description?: string) {
  return cleanOrderComment(description)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Способ оплаты:/i.test(line));
}

function buildOrderDescription(input: {
  userId: number;
  previousDescription?: string;
  delivery: DeliverySelection;
}) {
  const lines = [
    `TgMiniApp order for user ${input.userId}`,
    ...extractPaymentLines(input.previousDescription),
  ];

  if (input.delivery.method.code === "pickup") {
    lines.push(
      `Адрес самовывоза: ${input.delivery.pickupAddress?.address ?? ""}`,
      `Дата самовывоза: ${input.delivery.pickupDateText ?? ""}`,
      `Время самовывоза: ${input.delivery.pickupTimeText ?? ""}`,
    );
  }

  return lines.join("\n");
}

function getDeliveryMethodCodeFromType(deliveryType: string | null) {
  const normalizedType = normalizeStateName(deliveryType ?? "");

  if (normalizedType.includes("самовывоз")) {
    return "pickup";
  }

  if (normalizedType.includes("cdek") || normalizedType.includes("сдек")) {
    return "cdek";
  }

  if (normalizedType.includes("яндекс")) {
    return "yandex_express";
  }

  return null;
}

function buildDeliveryTypeValue(delivery: DeliverySelection) {
  if (delivery.method.code === "pickup") {
    return `Самовывоз: ${delivery.pickupAddress?.title ?? "Самовывоз"}`;
  }

  return delivery.method.title;
}

function getOrderCounterpartyId(order: MoySkladCustomerOrder) {
  return order.agent?.id ?? order.agent?.meta?.href.split("/").pop() ?? null;
}

function isOrderOwnedByCounterparty(
  order: MoySkladCustomerOrder,
  counterpartyId: string,
) {
  return getOrderCounterpartyId(order) === counterpartyId;
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

function isCurrentOrder(order: {
  status: OrderStatus;
  updatedAt?: string;
}) {
  if (CURRENT_ORDER_STATUSES.includes(order.status)) {
    return true;
  }

  if (order.status !== "CANCELED" || !order.updatedAt) {
    return false;
  }

  return Date.now() - new Date(order.updatedAt).getTime() < CANCELED_CURRENT_TTL_MS;
}

async function getPickupReservation(orderId: string) {
  return prisma.pickupSlotReservation.findFirst({
    where: {
      moySkladOrderId: orderId,
    },
    include: {
      pickupAddress: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

async function mapProfileOrder(order: MoySkladCustomerOrder) {
  const [positions, pickupReservation] = await Promise.all([
    getMoySkladCustomerOrderPositions(order),
    getPickupReservation(order.id),
  ]);
  const items = await Promise.all(
    positions.map(async (position, index) => {
      const variantId =
        position.assortment?.id ?? position.assortment?.meta.href.split("/").pop();
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
  const deliveryType = getMoySkladCustomerOrderDeliveryType(order);
  const deliveryMethodCode = getDeliveryMethodCodeFromType(deliveryType);
  const status = getStatus(order);
  const editState = getEditState({
    status,
    deliveryMethodCode,
  });

  return {
    id: order.id,
    name: order.name,
    createdAt: new Date(order.created ?? order.moment ?? Date.now()).toISOString(),
    updatedAt: new Date(order.updated ?? order.created ?? Date.now()).toISOString(),
    status,
    stateName: order.state?.name ?? null,
    customerName: order.agent?.name ?? "",
    customerPhone: order.agent?.phone ?? "",
    deliveryType,
    deliveryMethodCode,
    comment: cleanOrderComment(order.description),
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
    totalPrice: Math.round((order.sum ?? 0) / 100),
  };
}

async function validateDeliverySelection(body: EditOrderBody) {
  await ensureDeliveryAndPaymentMethods();

  const deliveryMethodCode = body.deliveryMethodCode?.trim() ?? "";

  if (!deliveryMethodCode) {
    throw new Error("DELIVERY_METHOD_REQUIRED");
  }

  const method = await prisma.deliveryMethod.findUnique({
    where: {
      code: deliveryMethodCode,
    },
  });

  if (!method || !method.isActive) {
    throw new Error("DELIVERY_METHOD_INACTIVE");
  }

  const delivery: DeliverySelection = {
    method: {
      code: method.code,
      title: method.title,
    },
  };

  if (method.code !== "pickup") {
    return delivery;
  }

  const pickupAddressId = Number(body.pickupAddressId);

  if (!Number.isInteger(pickupAddressId)) {
    throw new Error("PICKUP_ADDRESS_REQUIRED");
  }

  const pickupAddress = await prisma.pickupAddress.findFirst({
    where: {
      id: pickupAddressId,
      isActive: true,
    },
  });

  if (!pickupAddress) {
    throw new Error("PICKUP_ADDRESS_UNAVAILABLE");
  }

  const pickupDate = parsePickupDate(body.pickupDate);
  const pickupTimeMinutes = parsePickupTime(body.pickupTime);

  if (!pickupDate) {
    throw new Error("PICKUP_DATE_REQUIRED");
  }

  if (pickupTimeMinutes === null) {
    throw new Error("PICKUP_TIME_REQUIRED");
  }

  const pickupWindow = getPickupDateWindow();
  const pickupDateText = formatDate(pickupDate);

  if (pickupDate < pickupWindow.from || pickupDate > pickupWindow.to) {
    throw new Error("PICKUP_DATE_UNAVAILABLE");
  }

  if (
    pickupTimeMinutes < pickupAddress.startTimeMinutes ||
    pickupTimeMinutes >= pickupAddress.endTimeMinutes ||
    (pickupTimeMinutes - pickupAddress.startTimeMinutes) %
      pickupAddress.slotStepMinutes !==
      0
  ) {
    throw new Error("PICKUP_TIME_UNAVAILABLE");
  }

  if (!isPickupSlotLeadTimeAvailable(pickupDate, pickupTimeMinutes)) {
    throw new Error("PICKUP_TIME_UNAVAILABLE");
  }

  return {
    ...delivery,
    pickupAddress: {
      id: pickupAddress.id,
      title: pickupAddress.title,
      address: pickupAddress.address,
      description: pickupAddress.description,
    },
    pickupDate,
    pickupDateText,
    pickupTimeMinutes,
    pickupTimeText: formatPickupTime(pickupTimeMinutes),
  };
}

async function replacePickupReservation(input: {
  orderId: string;
  orderName: string;
  userId: number;
  delivery: DeliverySelection;
}) {
  await cleanupExpiredPickupReservations();

  const existingReservation = await prisma.pickupSlotReservation.findFirst({
    where: {
      moySkladOrderId: input.orderId,
    },
  });

  if (
    input.delivery.method.code !== "pickup" ||
    !input.delivery.pickupAddress ||
    !input.delivery.pickupDate ||
    input.delivery.pickupTimeMinutes === undefined
  ) {
    return {
      reservation: null,
      previousReservation: existingReservation,
    };
  }

  const reservationData = {
    pickupAddressId: input.delivery.pickupAddress.id,
    pickupDate: input.delivery.pickupDate,
    pickupTimeMinutes: input.delivery.pickupTimeMinutes,
    userId: input.userId,
    status: "CONFIRMED",
    moySkladOrderId: input.orderId,
    moySkladOrderName: input.orderName,
    expiresAt: null,
  };

  if (
    existingReservation &&
    existingReservation.pickupAddressId === reservationData.pickupAddressId &&
    formatDate(existingReservation.pickupDate) ===
      formatDate(reservationData.pickupDate) &&
    existingReservation.pickupTimeMinutes === reservationData.pickupTimeMinutes
  ) {
    const reservation = await prisma.pickupSlotReservation.update({
      where: {
        id: existingReservation.id,
      },
      data: reservationData,
    });

    return {
      reservation,
      previousReservation: null,
    };
  }

  try {
    const reservation = await prisma.pickupSlotReservation.create({
      data: {
        ...reservationData,
        status: "PENDING",
        expiresAt: getPickupReservationExpiresAt(),
      },
    });

    return {
      reservation,
      previousReservation: existingReservation,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PickupSlotUnavailableError();
    }

    throw error;
  }
}

function getDeliveryValidationMessage(code: string) {
  const messageByCode: Record<string, string> = {
    DELIVERY_METHOD_REQUIRED: "Выберите способ доставки",
    DELIVERY_METHOD_INACTIVE: "Этот способ доставки сейчас недоступен",
    PICKUP_ADDRESS_REQUIRED: "Выберите адрес самовывоза",
    PICKUP_ADDRESS_UNAVAILABLE: "Этот адрес самовывоза сейчас недоступен",
    PICKUP_DATE_REQUIRED: "Выберите день самовывоза",
    PICKUP_DATE_UNAVAILABLE: "Этот день самовывоза недоступен",
    PICKUP_TIME_REQUIRED: "Выберите время самовывоза",
    PICKUP_TIME_UNAVAILABLE: "Это время самовывоза недоступно",
  };

  return messageByCode[code] ?? "Проверьте способ доставки";
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
    const currentOrders = orders.filter(isCurrentOrder);
    const historyOrders = orders.filter((order) => !isCurrentOrder(order));

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

  app.post("/orders/:orderId/cancel", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      orderId: string;
    };

    if (!user.moySkladCounterpartyId) {
      return reply.status(404).send({
        message: "Заказ не найден",
      });
    }

    const order = await getMoySkladCustomerOrder(params.orderId);

    if (!isOrderOwnedByCounterparty(order, user.moySkladCounterpartyId)) {
      return reply.status(404).send({
        message: "Заказ не найден",
      });
    }

    const status = getStatus(order);

    if (status === "COMPLETED" || status === "CANCELED") {
      return reply.status(400).send({
        message:
          status === "COMPLETED" ? "Заказ уже завершён" : "Заказ уже отменён",
      });
    }

    const canceledStateMeta = await getMoySkladOrderCanceledStateMeta();

    if (!canceledStateMeta) {
      return reply.status(500).send({
        message: "Не настроен статус отмены в МойСклад",
      });
    }

    const updatedOrder = await updateMoySkladCustomerOrder({
      orderId: order.id,
      stateMeta: canceledStateMeta,
    });

    await prisma.pickupSlotReservation.deleteMany({
      where: {
        moySkladOrderId: order.id,
      },
    });

    return mapProfileOrder({
      ...order,
      ...updatedOrder,
      state: updatedOrder.state ?? order.state,
      agent: updatedOrder.agent ?? order.agent,
      positions: updatedOrder.positions ?? order.positions,
    });
  });

  app.patch("/orders/:orderId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      orderId: string;
    };
    const body = (request.body ?? {}) as EditOrderBody;
    const customerName = body.customerName?.trim() ?? "";
    const customerPhone = body.customerPhone?.trim() ?? "";

    if (!user.moySkladCounterpartyId) {
      return reply.status(404).send({
        message: "Заказ не найден",
      });
    }

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

    if (!/^\+?[0-9\s\-()]{7,24}$/.test(customerPhone)) {
      return reply.status(400).send({
        message: "Введите корректный номер телефона",
      });
    }

    const order = await getMoySkladCustomerOrder(params.orderId);

    if (!isOrderOwnedByCounterparty(order, user.moySkladCounterpartyId)) {
      return reply.status(404).send({
        message: "Заказ не найден",
      });
    }

    const currentDeliveryType = getMoySkladCustomerOrderDeliveryType(order);
    const currentDeliveryMethodCode = getDeliveryMethodCodeFromType(currentDeliveryType);
    const editState = getEditState({
      status: getStatus(order),
      deliveryMethodCode: currentDeliveryMethodCode,
    });

    if (!editState.canEdit) {
      return reply.status(400).send({
        message: editState.editDisabledReason ?? "Заказ нельзя изменить",
      });
    }

    let delivery: DeliverySelection;

    try {
      delivery = await validateDeliverySelection(body);
    } catch (error) {
      if (error instanceof Error) {
        return reply.status(400).send({
          message: getDeliveryValidationMessage(error.message),
        });
      }

      throw error;
    }

    let pickupReservationChange:
      | Awaited<ReturnType<typeof replacePickupReservation>>
      | null = null;

    try {
      pickupReservationChange = await replacePickupReservation({
        orderId: order.id,
        orderName: order.name,
        userId: user.id,
        delivery,
      });
    } catch (error) {
      if (error instanceof PickupSlotUnavailableError) {
        return reply.status(409).send({
          code: "PICKUP_SLOT_UNAVAILABLE",
          message: "Это время уже занято",
        });
      }

      throw error;
    }

    const preparingStateMeta = await getMoySkladOrderPreparingStateMeta();
    const counterpartyId = getOrderCounterpartyId(order);

    if (counterpartyId) {
      await updateMoySkladCounterpartyContact({
        counterpartyId,
        name: customerName,
        phone: customerPhone,
      });
    }

    try {
      const updatedOrder = await updateMoySkladCustomerOrder({
        orderId: order.id,
        description: buildOrderDescription({
          userId: user.id,
          previousDescription: order.description,
          delivery,
        }),
        deliveryPlannedMoment:
          delivery.method.code === "pickup" &&
          delivery.pickupDate &&
          delivery.pickupTimeMinutes !== undefined
            ? buildMoySkladDateTime(delivery.pickupDate, delivery.pickupTimeMinutes)
            : null,
        deliveryType: buildDeliveryTypeValue(delivery),
        stateMeta: preparingStateMeta ?? undefined,
      });

      if (pickupReservationChange?.reservation) {
        await prisma.pickupSlotReservation.update({
          where: {
            id: pickupReservationChange.reservation.id,
          },
          data: {
            status: "CONFIRMED",
            expiresAt: null,
          },
        });
      }

      if (pickupReservationChange?.previousReservation) {
        await prisma.pickupSlotReservation.delete({
          where: {
            id: pickupReservationChange.previousReservation.id,
          },
        });
      }

      return mapProfileOrder({
        ...order,
        ...updatedOrder,
        agent: {
          ...(order.agent ?? {}),
          ...(updatedOrder.agent ?? {}),
          name: customerName,
          phone: customerPhone,
        },
        state: updatedOrder.state ?? order.state,
        positions: updatedOrder.positions ?? order.positions,
      });
    } catch (error) {
      if (pickupReservationChange?.reservation?.status === "PENDING") {
        await prisma.pickupSlotReservation.delete({
          where: {
            id: pickupReservationChange.reservation.id,
          },
        });
      }

      throw error;
    }
  });
};
