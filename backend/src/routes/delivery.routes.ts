import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";

const PICKUP_DAYS_COUNT = 7;
const PENDING_SLOT_TTL_MINUTES = 15;
const MOSCOW_UTC_OFFSET_MINUTES = 180;
const MIN_PICKUP_LEAD_TIME_MINUTES = 60;
const DEFAULT_DELIVERY_METHODS = [
  {
    code: "pickup",
    title: "Самовывоз",
    isActive: true,
    sortOrder: 10,
  },
  {
    code: "cdek",
    title: "Доставка CDEK",
    isActive: false,
    sortOrder: 20,
  },
  {
    code: "yandex_express",
    title: "Экспресс доставка Яндекс",
    isActive: false,
    sortOrder: 30,
  },
];
const DEFAULT_PAYMENT_METHODS = [
  {
    code: "cash",
    title: "Наличные",
    isActive: true,
    sortOrder: 10,
  },
  {
    code: "card",
    title: "Карта",
    isActive: true,
    sortOrder: 20,
  },
];

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMoscowNow() {
  return new Date(Date.now() + MOSCOW_UTC_OFFSET_MINUTES * 60 * 1000);
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function pickupDateTimeToUtcMs(date: Date, timeMinutes: number) {
  return (
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      Math.floor(timeMinutes / 60),
      timeMinutes % 60,
    ) -
    MOSCOW_UTC_OFFSET_MINUTES * 60 * 1000
  );
}

export function isPickupSlotLeadTimeAvailable(date: Date, timeMinutes: number) {
  return (
    pickupDateTimeToUtcMs(date, timeMinutes) >=
    Date.now() + MIN_PICKUP_LEAD_TIME_MINUTES * 60 * 1000
  );
}

export async function cleanupExpiredPickupReservations() {
  await prisma.pickupSlotReservation.deleteMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lte: new Date(),
      },
    },
  });
}

export function getPickupDateWindow() {
  const today = startOfUtcDay(getMoscowNow());
  const dates = Array.from({ length: PICKUP_DAYS_COUNT }, (_, index) =>
    addDays(today, index),
  );

  return {
    from: dates[0],
    to: dates[dates.length - 1],
    dates,
  };
}

export function getPickupReservationExpiresAt() {
  return new Date(Date.now() + PENDING_SLOT_TTL_MINUTES * 60 * 1000);
}

export async function ensureDeliveryAndPaymentMethods() {
  await Promise.all([
    ...DEFAULT_DELIVERY_METHODS.map((method) =>
      prisma.deliveryMethod.upsert({
        where: {
          code: method.code,
        },
        create: method,
        update: {
          title: method.title,
          sortOrder: method.sortOrder,
        },
      }),
    ),
    ...DEFAULT_PAYMENT_METHODS.map((method) =>
      prisma.paymentMethod.upsert({
        where: {
          code: method.code,
        },
        create: method,
        update: {
          title: method.title,
          sortOrder: method.sortOrder,
        },
      }),
    ),
  ]);
}

export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    await ensureDeliveryAndPaymentMethods();
    await cleanupExpiredPickupReservations();

    const window = getPickupDateWindow();
    const [methods, paymentMethods, paymentAvailability, pickupAddresses] =
      await Promise.all([
      prisma.deliveryMethod.findMany({
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            id: "asc",
          },
        ],
      }),
      prisma.paymentMethod.findMany({
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            id: "asc",
          },
        ],
      }),
      prisma.deliveryMethodPaymentMethod.findMany({
        include: {
          deliveryMethod: true,
          paymentMethod: true,
        },
        orderBy: [
          {
            deliveryMethodId: "asc",
          },
          {
            paymentMethodId: "asc",
          },
        ],
      }),
      prisma.pickupAddress.findMany({
        where: {
          isActive: true,
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            id: "asc",
          },
        ],
      }),
    ]);

    return {
      methods: methods.map((method) => ({
        code: method.code,
        title: method.title,
        isActive: method.isActive,
      })),
      paymentMethods: paymentMethods.map((method) => ({
        code: method.code,
        title: method.title,
        isActive: method.isActive,
      })),
      paymentAvailability: paymentAvailability.map((relation) => ({
        deliveryMethodCode: relation.deliveryMethod.code,
        paymentMethodCode: relation.paymentMethod.code,
      })),
      pickupAddresses: pickupAddresses.map((address) => ({
        id: address.id,
        address: address.address,
        startTimeMinutes: address.startTimeMinutes,
        endTimeMinutes: address.endTimeMinutes,
        slotStepMinutes: address.slotStepMinutes,
      })),
      pickupDates: window.dates.map((date) => formatDate(date)),
    };
  });

  app.get("/pickup-slots", async (request, reply) => {
    await cleanupExpiredPickupReservations();

    const query = request.query as {
      pickupAddressId?: string;
    };
    const pickupAddressId = Number(query.pickupAddressId);

    if (!Number.isInteger(pickupAddressId)) {
      return reply.status(400).send({
        message: "Некорректный адрес самовывоза",
      });
    }

    const address = await prisma.pickupAddress.findFirst({
      where: {
        id: pickupAddressId,
        isActive: true,
      },
    });

    if (!address) {
      return reply.status(404).send({
        message: "Адрес самовывоза не найден",
      });
    }

    const window = getPickupDateWindow();
    const reservations = await prisma.pickupSlotReservation.findMany({
      where: {
        pickupAddressId: address.id,
        pickupDate: {
          gte: window.from,
          lte: window.to,
        },
      },
      select: {
        pickupDate: true,
        pickupTimeMinutes: true,
      },
    });
    const occupiedSlots = new Set(
      reservations.map(
        (reservation) =>
          `${formatDate(reservation.pickupDate)}:${reservation.pickupTimeMinutes}`,
      ),
    );
    const dates = window.dates
      .map((date) => {
        const timeSlots: number[] = [];

        for (
          let timeMinutes = address.startTimeMinutes;
          timeMinutes < address.endTimeMinutes;
          timeMinutes += address.slotStepMinutes
        ) {
          if (
            occupiedSlots.has(`${formatDate(date)}:${timeMinutes}`) ||
            !isPickupSlotLeadTimeAvailable(date, timeMinutes)
          ) {
            continue;
          }

          timeSlots.push(timeMinutes);
        }

        return {
          date: formatDate(date),
          timeSlots,
        };
      })
      .filter((date) => date.timeSlots.length > 0);

    return {
      pickupAddressId: address.id,
      dates,
    };
  });
};
