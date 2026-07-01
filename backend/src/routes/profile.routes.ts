import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import {
  findCatalogVariant,
  incrementCatalogVariantStocks,
} from "../services/catalog.service";
import {
  getCachedProfileOrder,
  getCachedProfileOrders,
  getStatus,
  mapCachedOrder,
  upsertCachedOrderFromMoySklad,
  type OrderStatus,
} from "../services/order-cache.service";
import {
  getMoySkladCounterparty,
  getMoySkladCustomerOrder,
  getMoySkladCustomerOrderDeliveryType,
  getMoySkladCustomerOrderPositions,
  getMoySkladOrderCanceledStateMeta,
  getMoySkladOrderChangedStateMeta,
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

type EditOrderBody = {
  customerName?: string;
  customerPhone?: string;
  deliveryMethodCode?: string;
  paymentMethodCode?: string;
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

type PaymentSelection = {
  method: {
    code: string;
    title: string;
  };
};

type RepeatOrderCartItem = {
  productVariantId: string;
  quantity: number;
  title: string;
};

type RepeatOrderUnavailableItem = {
  productVariantId: string;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
};

const CURRENT_ORDER_STATUSES: OrderStatus[] = [
  "CREATED",
  "PREPARING",
  "DELIVERING",
  "READY_FOR_PICKUP",
];
const CANCELED_CURRENT_TTL_MS = 12 * 60 * 60 * 1000;

class PickupSlotUnavailableError extends Error {
  constructor() {
    super("PICKUP_SLOT_UNAVAILABLE");
  }
}

function normalizeStateName(stateName: string | undefined) {
  return stateName?.trim().toLowerCase().replace(/ё/g, "е") ?? "";
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

function buildOrderCachePickupDateTime(date: Date, timeMinutes: number) {
  return new Date(buildMoySkladDateTime(date, timeMinutes).replace(" ", "T"));
}

function buildOrderDescription(input: {
  userId: number;
}) {
  return `TgMiniApp order for user ${input.userId}`;
}

function getDeliveryMethodCodeFromType(deliveryType: string | null) {
  const normalizedType = normalizeStateName(deliveryType ?? "");

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
  const normalizedType = normalizeStateName(deliveryType ?? "");

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

function buildDeliveryTypeValue(delivery: DeliverySelection) {
  const normalizedDeliveryType =
    delivery.method.code === "pickup"
      ? "Самовывоз"
      : normalizeDeliveryTypeValue(delivery.method.title);

  if (normalizedDeliveryType) {
    return normalizedDeliveryType;
  }

  if (delivery.method.code === "pickup") {
    return `Самовывоз: ${delivery.pickupAddress?.title ?? "Самовывоз"}`;
  }

  return delivery.method.title;
}

function buildReceivingAddressValue(
  delivery: DeliverySelection,
  currentReceivingAddress: string | null,
) {
  if (delivery.method.code === "pickup") {
    return delivery.pickupAddress?.address ?? "";
  }

  return currentReceivingAddress ?? "";
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

function getOrderAttributeString(order: MoySkladCustomerOrder, attributeName: string) {
  const normalizedAttributeName = normalizeStateName(attributeName);
  const attribute = order.attributes?.find((item) => {
    return normalizeStateName(item.name) === normalizedAttributeName;
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

async function mapProfileOrder(
  order: MoySkladCustomerOrder,
  counterpartyContact?: {
    name?: string;
    phone?: string;
  },
) {
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
  const deliveryType = normalizeDeliveryTypeValue(
    getMoySkladCustomerOrderDeliveryType(order),
  );
  const deliveryMethodCode = getDeliveryMethodCodeFromType(deliveryType);
  const status = getStatus(order);
  const editState = getEditState({
    status,
    deliveryMethodCode,
  });
  const profileReceivingAddress =
    getMoySkladCustomerOrderReceivingAddressValue(order) ??
    pickupReservation?.pickupAddress.address ??
    null;

  return {
    id: order.id,
    name: order.name,
    createdAt: new Date(order.created ?? order.moment ?? Date.now()).toISOString(),
    updatedAt: new Date(order.updated ?? order.created ?? Date.now()).toISOString(),
    status,
    stateName: order.state?.name ?? null,
    customerName: order.agent?.name ?? counterpartyContact?.name ?? "",
    customerPhone: order.agent?.phone ?? counterpartyContact?.phone ?? "",
    deliveryType,
    deliveryMethodCode,
    paymentType: getMoySkladCustomerOrderPaymentTypeValue(order),
    receivingAddress: profileReceivingAddress,
    pickupDateTime: order.deliveryPlannedMoment ?? null,
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

async function validatePaymentSelection(
  body: EditOrderBody,
  delivery: DeliverySelection,
) {
  const paymentMethodCode = body.paymentMethodCode?.trim() ?? "";

  if (!paymentMethodCode) {
    throw new Error("PAYMENT_METHOD_REQUIRED");
  }

  const paymentMethod = await prisma.paymentMethod.findUnique({
    where: {
      code: paymentMethodCode,
    },
  });

  if (!paymentMethod || !paymentMethod.isActive) {
    throw new Error("PAYMENT_METHOD_INACTIVE");
  }

  const availability = await prisma.deliveryMethodPaymentMethod.findFirst({
    where: {
      deliveryMethod: {
        code: delivery.method.code,
      },
      paymentMethodId: paymentMethod.id,
    },
  });

  if (!availability) {
    throw new Error("PAYMENT_METHOD_NOT_AVAILABLE");
  }

  return {
    method: {
      code: paymentMethod.code,
      title: paymentMethod.title,
    },
  };
}

function getPaymentValidationMessage(code: string) {
  const messageByCode: Record<string, string> = {
    PAYMENT_METHOD_REQUIRED: "Выберите способ оплаты",
    PAYMENT_METHOD_INACTIVE: "Этот способ оплаты сейчас недоступен",
    PAYMENT_METHOD_NOT_AVAILABLE:
      "Этот способ оплаты недоступен для выбранной доставки",
  };

  return messageByCode[code] ?? "Проверьте способ оплаты";
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

async function getCartCount(userId: number) {
  const cartItems = await prisma.cartItem.findMany({
    where: {
      userId,
    },
    select: {
      quantity: true,
    },
  });

  return cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

async function buildRepeatOrderCartItems(input: {
  order: MoySkladCustomerOrder;
  userId: number;
}) {
  const positions = await getMoySkladCustomerOrderPositions(input.order);
  const requestedItemsByVariantId = new Map<string, RepeatOrderCartItem>();

  for (const position of positions) {
    const productVariantId =
      position.assortment?.id ?? position.assortment?.meta.href.split("/").pop();
    const quantity = Math.trunc(position.quantity ?? 0);

    if (!productVariantId || quantity <= 0) {
      continue;
    }

    const currentItem = requestedItemsByVariantId.get(productVariantId);

    if (currentItem) {
      currentItem.quantity += quantity;
      continue;
    }

    requestedItemsByVariantId.set(productVariantId, {
      productVariantId,
      quantity,
      title: position.assortment?.name ?? "Товар",
    });
  }

  const requestedItems = Array.from(requestedItemsByVariantId.values());

  if (requestedItems.length === 0) {
    return {
      requestedItems,
      unavailableItems: [],
    };
  }

  const currentCartItems = await prisma.cartItem.findMany({
    where: {
      userId: input.userId,
      productVariantId: {
        in: requestedItems.map((item) => item.productVariantId),
      },
    },
  });
  const currentCartQuantityByVariantId = new Map(
    currentCartItems.map((item) => [item.productVariantId, item.quantity]),
  );
  const unavailableItems: RepeatOrderUnavailableItem[] = [];

  for (const item of requestedItems) {
    const catalogItem = await findCatalogVariant(item.productVariantId);
    const availableQuantity =
      catalogItem?.product.isActive && catalogItem.variant.isActive
        ? catalogItem.variant.maxQuantity
        : 0;
    const currentCartQuantity =
      currentCartQuantityByVariantId.get(item.productVariantId) ?? 0;

    if (!catalogItem || currentCartQuantity + item.quantity > availableQuantity) {
      unavailableItems.push({
        productVariantId: item.productVariantId,
        title: catalogItem?.variant.title ?? item.title,
        requestedQuantity: currentCartQuantity + item.quantity,
        availableQuantity,
      });
    }
  }

  return {
    requestedItems,
    unavailableItems,
  };
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
  app.get("/contact", async (request) => {
    const user = await getCurrentUser(request);

    if (!user.moySkladCounterpartyId) {
      return {
        customerName: "",
        customerPhone: "",
      };
    }

    const counterparty = await getMoySkladCounterparty(user.moySkladCounterpartyId);

    return {
      customerName: counterparty.name ?? "",
      customerPhone: counterparty.phone ?? "",
    };
  });

  app.get("/", async (request) => {
    const user = await getCurrentUser(request);

    request.log.info(
      {
        userId: user.id,
      },
      "profile_cached_orders_fetch_started",
    );

    const orders = await getCachedProfileOrders(user.id);
    const currentOrders = orders.filter(isCurrentOrder);
    const historyOrders = orders.filter((order) => !isCurrentOrder(order));

    request.log.info(
      {
        userId: user.id,
        ordersCount: orders.length,
        currentOrdersCount: currentOrders.length,
        historyOrdersCount: historyOrders.length,
      },
      "profile_cached_orders_fetch_completed",
    );

    return {
      currentOrders,
      historyOrders,
    };
  });

  app.get("/orders/:orderId", async (request, reply) => {
    const user = await getCurrentUser(request);
    const params = request.params as {
      orderId: string;
    };

    const cachedOrder = await getCachedProfileOrder(user.id, params.orderId);

    if (cachedOrder) {
      return cachedOrder;
    }

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

    const syncedOrder = await upsertCachedOrderFromMoySklad({
      order,
      userId: user.id,
    });

    return syncedOrder ? mapCachedOrder(syncedOrder) : mapProfileOrder(order);
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

    try {
      const positions = await getMoySkladCustomerOrderPositions(order);

      await incrementCatalogVariantStocks(
        positions.map((position) => ({
          productVariantId:
            position.assortment?.id ??
            position.assortment?.meta.href.split("/").pop(),
          quantity: Math.trunc(position.quantity ?? 0),
        })),
      );
    } catch (error) {
      request.log.error(
        {
          err: error,
          orderId: order.id,
        },
        "cancel_order_stock_cache_increment_failed",
      );
    }

    await prisma.pickupSlotReservation.deleteMany({
      where: {
        moySkladOrderId: order.id,
      },
    });

    const nextOrder = {
      ...order,
      ...updatedOrder,
      state: updatedOrder.state ?? order.state,
      agent: updatedOrder.agent ?? order.agent,
      positions: updatedOrder.positions ?? order.positions,
    };
    const cachedOrder = await upsertCachedOrderFromMoySklad({
      order: nextOrder,
      userId: user.id,
    });

    return cachedOrder ? mapCachedOrder(cachedOrder) : mapProfileOrder(nextOrder);
  });

  app.post("/orders/:orderId/repeat", async (request, reply) => {
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
    const updatedAt = new Date(order.updated ?? order.created ?? Date.now()).toISOString();

    if (status !== "CANCELED" || !isCurrentOrder({ status, updatedAt })) {
      return reply.status(400).send({
        message: "Этот заказ нельзя повторить",
      });
    }

    const { requestedItems, unavailableItems } = await buildRepeatOrderCartItems({
      order,
      userId: user.id,
    });

    if (requestedItems.length === 0) {
      return reply.status(400).send({
        message: "В заказе нет товаров для повтора",
      });
    }

    if (unavailableItems.length > 0) {
      return reply.status(409).send({
        code: "REPEAT_ORDER_UNAVAILABLE",
        message: "Некоторые товары сейчас недоступны",
        items: unavailableItems,
      });
    }

    await prisma.$transaction(
      requestedItems.map((item) =>
        prisma.cartItem.upsert({
          where: {
            userId_productVariantId: {
              userId: user.id,
              productVariantId: item.productVariantId,
            },
          },
          update: {
            quantity: {
              increment: item.quantity,
            },
          },
          create: {
            userId: user.id,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
          },
        }),
      ),
    );

    const cartCount = await getCartCount(user.id);

    return {
      cartCount,
      totalQuantity: cartCount,
    };
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
    let payment: PaymentSelection;

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

    try {
      payment = await validatePaymentSelection(body, delivery);
    } catch (error) {
      if (error instanceof Error) {
        return reply.status(400).send({
          message: getPaymentValidationMessage(error.message),
        });
      }

      throw error;
    }

    const changedStateMeta = await getMoySkladOrderChangedStateMeta();

    if (!changedStateMeta) {
      return reply.status(500).send({
        message: "Не настроен статус внесли изменения в МойСклад",
      });
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
        }),
        deliveryPlannedMoment:
          delivery.method.code === "pickup" &&
          delivery.pickupDate &&
          delivery.pickupTimeMinutes !== undefined
            ? buildMoySkladDateTime(delivery.pickupDate, delivery.pickupTimeMinutes)
            : null,
        deliveryType: buildDeliveryTypeValue(delivery),
        paymentType: payment.method.title,
        receivingAddress: buildReceivingAddressValue(
          delivery,
          getMoySkladCustomerOrderReceivingAddressValue(order),
        ),
        stateMeta: changedStateMeta,
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

      const nextOrder = {
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
      };
      const cachedOrder = await upsertCachedOrderFromMoySklad({
        order: nextOrder,
        userId: user.id,
        overrides: {
          customerName,
          customerPhone,
          deliveryType: buildDeliveryTypeValue(delivery),
          deliveryMethodCode: delivery.method.code,
          paymentType: payment.method.title,
          receivingAddress: buildReceivingAddressValue(
            delivery,
            getMoySkladCustomerOrderReceivingAddressValue(order),
          ),
          pickupDateTime:
            delivery.method.code === "pickup" &&
            delivery.pickupDate &&
            delivery.pickupTimeMinutes !== undefined
              ? buildOrderCachePickupDateTime(
                  delivery.pickupDate,
                  delivery.pickupTimeMinutes,
                )
              : null,
        },
      });

      return cachedOrder ? mapCachedOrder(cachedOrder) : mapProfileOrder(nextOrder);
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
