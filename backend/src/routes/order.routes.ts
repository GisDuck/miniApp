import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";
import { redisReleaseLock, redisSetLock } from "../lib/redis";
import {
  cleanupExpiredPickupReservations,
  ensureDeliveryAndPaymentMethods,
  getPickupDateWindow,
  getPickupReservationExpiresAt,
  isPickupSlotLeadTimeAvailable,
} from "./delivery.routes";
import {
  findCatalogVariant,
  refreshCatalogVariantStocks,
} from "../services/catalog.service";
import {
  createMoySkladCounterparty,
  createMoySkladCustomerOrder,
  getMoySkladAvailableStocksByAssortments,
  updateMoySkladCounterpartyContact,
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

class PickupSlotUnavailableError extends Error {
  constructor() {
    super("PICKUP_SLOT_UNAVAILABLE");
  }
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

function buildMoySkladDeliveryPlannedMoment(date: Date, timeMinutes: number) {
  return buildMoySkladDateTime(date, timeMinutes);
}

function normalizeDeliveryTypeValue(deliveryType: string) {
  const normalizedType = deliveryType.trim().toLowerCase().replace(/ё/g, "е");

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

function buildOrderDescription(input: {
  userId: number;
}) {
  return `TgMiniApp order for user ${input.userId}`;
}

function buildReceivingAddressValue(delivery: DeliverySelection) {
  if (delivery.method.code === "pickup") {
    return delivery.pickupAddress?.address ?? "";
  }

  return "";
}

async function validateDeliverySelection(body: CreateOrderBody) {
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
  body: CreateOrderBody,
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

async function reservePickupSlot(input: {
  delivery: DeliverySelection;
  userId: number;
}) {
  if (
    input.delivery.method.code !== "pickup" ||
    !input.delivery.pickupAddress ||
    !input.delivery.pickupDate ||
    input.delivery.pickupTimeMinutes === undefined
  ) {
    return null;
  }

  await cleanupExpiredPickupReservations();

  try {
    return await prisma.pickupSlotReservation.create({
      data: {
        pickupAddressId: input.delivery.pickupAddress.id,
        pickupDate: input.delivery.pickupDate,
        pickupTimeMinutes: input.delivery.pickupTimeMinutes,
        userId: input.userId,
        status: "PENDING",
        expiresAt: getPickupReservationExpiresAt(),
      },
    });
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
      telegramUser: {
        select: {
          telegramId: true,
        },
      },
    },
  });
  const telegramId = user.telegramUser?.telegramId ?? null;

  if (user.moySkladCounterpartyId) {
    await updateMoySkladCounterpartyContact({
      counterpartyId: user.moySkladCounterpartyId,
      name: input.customerName,
      phone: input.customerPhone,
    });

    return user.moySkladCounterpartyId;
  }

  const counterparty = await createMoySkladCounterparty({
    name: input.customerName,
    phone: input.customerPhone,
    description: `tgMiniApp user ${input.userId}`,
    telegramId,
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

async function validateLiveStocks(
  orderItems: OrderItemDraft[],
  logger: FastifyBaseLogger,
) {
  const stockByVariantId = new Map<string, number>();
  const uniqueVariantIds = Array.from(
    new Set(orderItems.map((item) => item.productVariantId)),
  );

  logger.info(
    {
      variantIds: uniqueVariantIds,
      itemsCount: orderItems.length,
    },
    "checkout_stock_validation_started",
  );

  try {
    const stocks = await getMoySkladAvailableStocksByAssortments(
      orderItems.map((item) => ({
        id: item.productVariantId,
        meta: item.assortmentMeta,
      })),
    );
    const stocksById = new Map(stocks.map((stock) => [stock.assortmentId, stock]));

    for (const item of orderItems) {
      const stock = stocksById.get(item.productVariantId);

      if (!stock) {
        stockByVariantId.set(item.productVariantId, 0);
        continue;
      }

      stockByVariantId.set(item.productVariantId, stock.availableQuantity);
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        variantIds: uniqueVariantIds,
      },
      "checkout_stock_validation_failed",
    );
    throw error;
  }

  logger.info(
    {
      stocks: Array.from(stockByVariantId.entries()).map(
        ([productVariantId, availableQuantity]) => ({
          productVariantId,
          availableQuantity,
        }),
      ),
    },
    "checkout_stock_validation_completed",
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
    let delivery: DeliverySelection;
    let payment: PaymentSelection;

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
      delivery = await validateDeliverySelection(body);
    } catch (error) {
      if (error instanceof Error) {
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

        return reply.status(400).send({
          message: messageByCode[error.message] ?? "Проверьте способ доставки",
        });
      }

      throw error;
    }

    try {
      payment = await validatePaymentSelection(body, delivery);
    } catch (error) {
      if (error instanceof Error) {
        const messageByCode: Record<string, string> = {
          PAYMENT_METHOD_REQUIRED: "Выберите способ оплаты",
          PAYMENT_METHOD_INACTIVE: "Этот способ оплаты сейчас недоступен",
          PAYMENT_METHOD_NOT_AVAILABLE:
            "Этот способ оплаты недоступен для выбранной доставки",
        };

        return reply.status(400).send({
          message: messageByCode[error.message] ?? "Проверьте способ оплаты",
        });
      }

      throw error;
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
      request.log.info(
        {
          userId: user.id,
          cartItemsCount: cartItems.length,
          requestedVariantIds,
        },
        "checkout_started",
      );

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
        await validateLiveStocks(orderItems, request.log);

        request.log.info(
          {
            userId: user.id,
            deliveryMethodCode: delivery.method.code,
          },
          "checkout_pickup_slot_reservation_started",
        );
        const pickupSlotReservation = await reservePickupSlot({
          delivery,
          userId: user.id,
        });
        let isMoySkladOrderCreated = false;
        request.log.info(
          {
            userId: user.id,
            reservationId: pickupSlotReservation?.id ?? null,
          },
          "checkout_pickup_slot_reservation_completed",
        );

        request.log.info(
          {
            userId: user.id,
          },
          "checkout_counterparty_started",
        );
        let counterpartyId: string;

        try {
          counterpartyId = await getOrCreateCounterparty({
            userId: user.id,
            customerName,
            customerPhone,
          });
        } catch (error) {
          request.log.error(
            {
              err: error,
              userId: user.id,
            },
            "checkout_counterparty_failed",
          );
          if (pickupSlotReservation) {
            try {
              await prisma.pickupSlotReservation.delete({
                where: {
                  id: pickupSlotReservation.id,
                },
              });
            } catch (releaseError) {
              request.log.error(
                {
                  err: releaseError,
                  reservationId: pickupSlotReservation.id,
                },
                "checkout_pickup_slot_release_failed",
              );
            }
          }
          throw error;
        }
        request.log.info(
          {
            userId: user.id,
            counterpartyId,
          },
          "checkout_counterparty_completed",
        );

        request.log.info(
          {
            userId: user.id,
            counterpartyId,
            positions: orderItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
          "checkout_customer_order_started",
        );
        let order: Awaited<ReturnType<typeof createMoySkladCustomerOrder>>;

        try {
          order = await createMoySkladCustomerOrder({
            counterpartyId,
            description: buildOrderDescription({
              userId: user.id,
            }),
            deliveryPlannedMoment:
              delivery.method.code === "pickup" &&
              delivery.pickupDate &&
              delivery.pickupTimeMinutes !== undefined
                ? buildMoySkladDeliveryPlannedMoment(
                    delivery.pickupDate,
                    delivery.pickupTimeMinutes,
                  )
                : undefined,
            deliveryType: buildDeliveryTypeValue(delivery),
            paymentType: payment.method.title,
            receivingAddress: buildReceivingAddressValue(delivery),
            positions: orderItems.map((item) => ({
              quantity: item.quantity,
              reserve: item.quantity,
              price: item.price * 100,
              assortmentMeta: item.assortmentMeta,
            })),
          });
        } catch (error) {
          request.log.error(
            {
              err: error,
              userId: user.id,
              counterpartyId,
              positions: orderItems.map((item) => ({
                productVariantId: item.productVariantId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
            "checkout_customer_order_failed",
          );
          if (pickupSlotReservation && !isMoySkladOrderCreated) {
            try {
              await prisma.pickupSlotReservation.delete({
                where: {
                  id: pickupSlotReservation.id,
                },
              });
            } catch (releaseError) {
              request.log.error(
                {
                  err: releaseError,
                  reservationId: pickupSlotReservation.id,
                },
                "checkout_pickup_slot_release_failed",
              );
            }
          }
          throw error;
        }
        isMoySkladOrderCreated = true;
        request.log.info(
          {
            userId: user.id,
            orderId: order.id,
            orderName: order.name,
          },
          "checkout_customer_order_completed",
        );
        if (pickupSlotReservation) {
          await prisma.pickupSlotReservation.update({
            where: {
              id: pickupSlotReservation.id,
            },
            data: {
              status: "CONFIRMED",
              moySkladOrderId: order.id,
              moySkladOrderName: order.name,
              expiresAt: null,
            },
          });
        }
        const totalPrice = orderItems.reduce((sum, item) => {
          return sum + item.price * item.quantity;
        }, 0);

        try {
          await prisma.cartItem.deleteMany({
            where: {
              userId: user.id,
              id: {
                in: orderItems.map((item) => item.cartItemId),
              },
            },
          });
        } catch (error) {
          request.log.error(
            {
              err: error,
              userId: user.id,
              orderId: order.id,
              cartItemIds: orderItems.map((item) => item.cartItemId),
            },
            "checkout_cart_cleanup_failed",
          );
          throw error;
        }

        try {
          await refreshCatalogVariantStocks(requestedVariantIds);
        } catch (error) {
          request.log.error(
            {
              err: error,
              requestedVariantIds,
            },
            "checkout_stock_cache_refresh_failed",
          );
        }

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
          delivery: {
            methodCode: delivery.method.code,
            methodTitle: delivery.method.title,
            pickupAddress: delivery.pickupAddress ?? null,
            pickupDate: delivery.pickupDateText ?? null,
            pickupTime: delivery.pickupTimeText ?? null,
          },
          payment: {
            methodCode: payment.method.code,
            methodTitle: payment.method.title,
          },
          items: orderItems.map((item) => ({
            productVariantId: item.productVariantId,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
          remainingCartCount,
        });
      } finally {
        try {
          await releaseCheckoutLocks(locks);
        } catch (error) {
          request.log.error(
            {
              err: error,
              requestedVariantIds,
            },
            "checkout_locks_release_failed",
          );
        }
      }
    } catch (error) {
      if (requestedVariantIds.length > 0) {
        try {
          await refreshCatalogVariantStocks(requestedVariantIds);
        } catch (refreshError) {
          request.log.error(
            {
              err: refreshError,
              requestedVariantIds,
            },
            "checkout_failure_stock_cache_refresh_failed",
          );
          // The order response should reflect the checkout failure, not cache refresh.
        }
      }

      if (error instanceof PickupSlotUnavailableError) {
        return reply.status(409).send({
          code: "PICKUP_SLOT_UNAVAILABLE",
          message: "Это время уже занято",
        });
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

      request.log.error(
        {
          err: error,
          userId: user.id,
          requestedVariantIds,
        },
        "checkout_failed_unhandled",
      );
      throw error;
    }
  });
};
