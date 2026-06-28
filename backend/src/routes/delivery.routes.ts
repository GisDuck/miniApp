import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma";

const PICKUP_DAYS_COUNT = 7;
const PENDING_SLOT_TTL_MINUTES = 15;

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
  const today = startOfUtcDay(new Date());
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

export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    await cleanupExpiredPickupReservations();

    const window = getPickupDateWindow();
    const [methods, pickupAddresses, reservations] = await Promise.all([
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
      prisma.pickupSlotReservation.findMany({
        where: {
          pickupDate: {
            gte: window.from,
            lte: window.to,
          },
        },
        select: {
          pickupAddressId: true,
          pickupDate: true,
          pickupTimeMinutes: true,
        },
      }),
    ]);

    return {
      methods: methods.map((method) => ({
        code: method.code,
        title: method.title,
        isActive: method.isActive,
      })),
      pickupAddresses: pickupAddresses.map((address) => ({
        id: address.id,
        title: address.title,
        address: address.address,
        startTimeMinutes: address.startTimeMinutes,
        endTimeMinutes: address.endTimeMinutes,
        slotStepMinutes: address.slotStepMinutes,
      })),
      pickupDates: window.dates.map((date) => formatDate(date)),
      pickupReservations: reservations.map((reservation) => ({
        pickupAddressId: reservation.pickupAddressId,
        pickupDate: formatDate(reservation.pickupDate),
        pickupTimeMinutes: reservation.pickupTimeMinutes,
      })),
    };
  });
};
