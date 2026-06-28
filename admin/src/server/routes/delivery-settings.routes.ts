import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma.js";

const DEFAULT_ADDRESS_START_MINUTES = 10 * 60;
const DEFAULT_ADDRESS_END_MINUTES = 20 * 60;
const DEFAULT_SLOT_STEP_MINUTES = 30;
const ADMIN_BLOCK_STATUS = "ADMIN_BLOCK";

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

function parseAddressId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTimeMinutes(value: unknown, fallback: number) {
  const minutes = Number(value);

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) {
    return fallback;
  }

  return minutes;
}

function parseDateInput(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    return null;
  }

  return date;
}

function parseTimeInput(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  const timeMinutes = hours * 60 + minutes;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return timeMinutes;
}

async function getAdminBlockUserId() {
  const telegramId = BigInt(-1);
  const existingTelegramUser = await prisma.telegramUser.findUnique({
    where: {
      telegramId,
    },
  });

  if (existingTelegramUser) {
    return existingTelegramUser.userId;
  }

  const user = await prisma.user.create({
    data: {
      telegramUser: {
        create: {
          telegramId,
          username: "admin_slot_block",
          firstName: "Admin slot block",
        },
      },
    },
  });

  return user.id;
}

async function ensureDeliveryMethods() {
  const defaults = [
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

  await Promise.all(
    defaults.map((method) =>
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
  );
}

async function cleanupExpiredPickupReservations() {
  await prisma.pickupSlotReservation.deleteMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lte: new Date(),
      },
    },
  });
}

async function getDeliverySettings() {
  await ensureDeliveryMethods();
  await cleanupExpiredPickupReservations();

  const today = startOfUtcDay(new Date());
  const endDate = addDays(today, 13);
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
          gte: today,
          lte: endDate,
        },
      },
      include: {
        pickupAddress: true,
      },
      orderBy: [
        {
          pickupDate: "asc",
        },
        {
          pickupTimeMinutes: "asc",
        },
      ],
    }),
  ]);

  return {
    methods: methods.map((method) => ({
      code: method.code,
      title: method.title,
      isActive: method.isActive,
      sortOrder: method.sortOrder,
    })),
    pickupAddresses: pickupAddresses.map((address) => ({
      id: address.id,
      title: address.title,
      address: address.address,
      description: address.description ?? "",
      isActive: address.isActive,
      sortOrder: address.sortOrder,
      startTimeMinutes: address.startTimeMinutes,
      endTimeMinutes: address.endTimeMinutes,
      slotStepMinutes: address.slotStepMinutes,
    })),
    reservations: reservations.map((reservation) => ({
      id: reservation.id,
      pickupAddressId: reservation.pickupAddressId,
      pickupAddressTitle: reservation.pickupAddress.title,
      pickupDate: formatDate(reservation.pickupDate),
      pickupTimeMinutes: reservation.pickupTimeMinutes,
      status: reservation.status,
      moySkladOrderId: reservation.moySkladOrderId,
      moySkladOrderName: reservation.moySkladOrderName,
    })),
  };
}

function validateAddressInput(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const address = String(body.address ?? "").trim();
  const description = String(body.description ?? "").trim();
  const startTimeMinutes = normalizeTimeMinutes(
    body.startTimeMinutes,
    DEFAULT_ADDRESS_START_MINUTES,
  );
  const endTimeMinutes = normalizeTimeMinutes(
    body.endTimeMinutes,
    DEFAULT_ADDRESS_END_MINUTES,
  );
  const slotStepMinutes = normalizeTimeMinutes(
    body.slotStepMinutes,
    DEFAULT_SLOT_STEP_MINUTES,
  );

  if (!title) {
    throw new Error("Введите название адреса");
  }

  if (!address) {
    throw new Error("Введите адрес самовывоза");
  }

  if (startTimeMinutes >= endTimeMinutes) {
    throw new Error("Время начала должно быть раньше времени окончания");
  }

  if (slotStepMinutes <= 0 || slotStepMinutes > 180) {
    throw new Error("Укажите корректный шаг времени");
  }

  return {
    title,
    address,
    description: description || null,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    startTimeMinutes,
    endTimeMinutes,
    slotStepMinutes,
  };
}

export const deliverySettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return getDeliverySettings();
  });

  app.patch("/methods/:code", async (request, reply) => {
    const params = request.params as {
      code: string;
    };
    const body = (request.body ?? {}) as {
      isActive?: boolean;
    };

    await ensureDeliveryMethods();

    const method = await prisma.deliveryMethod.findUnique({
      where: {
        code: params.code,
      },
    });

    if (!method) {
      return reply.status(404).send({
        message: "Способ доставки не найден",
      });
    }

    await prisma.deliveryMethod.update({
      where: {
        code: params.code,
      },
      data: {
        isActive: Boolean(body.isActive),
      },
    });

    return getDeliverySettings();
  });

  app.post("/pickup-addresses", async (request, reply) => {
    try {
      const data = validateAddressInput((request.body ?? {}) as Record<string, unknown>);

      await prisma.pickupAddress.create({
        data,
      });

      return getDeliverySettings();
    } catch (error) {
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "Проверьте адрес",
      });
    }
  });

  app.patch("/pickup-addresses/:addressId", async (request, reply) => {
    const params = request.params as {
      addressId: string;
    };
    const addressId = parseAddressId(params.addressId);

    if (!addressId) {
      return reply.status(400).send({
        message: "Некорректный адрес",
      });
    }

    try {
      const data = validateAddressInput((request.body ?? {}) as Record<string, unknown>);

      await prisma.pickupAddress.update({
        where: {
          id: addressId,
        },
        data,
      });

      return getDeliverySettings();
    } catch (error) {
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "Проверьте адрес",
      });
    }
  });

  app.delete("/pickup-addresses/:addressId", async (request, reply) => {
    const params = request.params as {
      addressId: string;
    };
    const addressId = parseAddressId(params.addressId);

    if (!addressId) {
      return reply.status(400).send({
        message: "Некорректный адрес",
      });
    }

    await prisma.pickupAddress.delete({
      where: {
        id: addressId,
      },
    });

    return getDeliverySettings();
  });

  app.post("/pickup-slot-blocks", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const pickupAddressId = Number(body.pickupAddressId);
    const pickupDate = parseDateInput(body.pickupDate);
    const startTimeMinutes = parseTimeInput(body.startTime);
    const endTimeMinutes = parseTimeInput(body.endTime);

    if (!Number.isInteger(pickupAddressId) || pickupAddressId <= 0) {
      return reply.status(400).send({
        message: "Выберите склад",
      });
    }

    if (!pickupDate) {
      return reply.status(400).send({
        message: "Выберите дату",
      });
    }

    if (startTimeMinutes === null || endTimeMinutes === null) {
      return reply.status(400).send({
        message: "Выберите корректный промежуток",
      });
    }

    if (startTimeMinutes > endTimeMinutes) {
      return reply.status(400).send({
        message: "Время начала должно быть раньше или равно времени окончания",
      });
    }

    const address = await prisma.pickupAddress.findUnique({
      where: {
        id: pickupAddressId,
      },
    });

    if (!address) {
      return reply.status(404).send({
        message: "Склад не найден",
      });
    }

    await cleanupExpiredPickupReservations();

    const normalizedStart = Math.max(startTimeMinutes, address.startTimeMinutes);
    const normalizedEnd = Math.min(endTimeMinutes, address.endTimeMinutes - address.slotStepMinutes);
    const firstSlotOffset =
      (normalizedStart - address.startTimeMinutes) % address.slotStepMinutes;
    const firstSlot =
      firstSlotOffset === 0
        ? normalizedStart
        : normalizedStart + address.slotStepMinutes - firstSlotOffset;
    const slots: number[] = [];

    for (
      let timeMinutes = firstSlot;
      timeMinutes <= normalizedEnd;
      timeMinutes += address.slotStepMinutes
    ) {
      slots.push(timeMinutes);
    }

    if (slots.length === 0) {
      return reply.status(400).send({
        message: "В этом промежутке нет слотов по настройкам склада",
      });
    }

    const userId = await getAdminBlockUserId();

    await prisma.$transaction(
      slots.map((pickupTimeMinutes) =>
        prisma.pickupSlotReservation.upsert({
          where: {
            pickupAddressId_pickupDate_pickupTimeMinutes: {
              pickupAddressId,
              pickupDate,
              pickupTimeMinutes,
            },
          },
          create: {
            pickupAddressId,
            pickupDate,
            pickupTimeMinutes,
            userId,
            status: ADMIN_BLOCK_STATUS,
            moySkladOrderName: "Заблокировано админкой",
          },
          update: {},
        }),
      ),
    );

    return getDeliverySettings();
  });
};
