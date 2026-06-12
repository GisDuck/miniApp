import type { FastifyRequest } from "fastify";

import { prisma } from "../lib/prisma";
import { validateTelegramInitData } from "../utils/telegram";

export async function getCurrentUser(request: FastifyRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const initDataHeader = request.headers["x-telegram-init-data"];
  const initData = Array.isArray(initDataHeader)
    ? initDataHeader[0]
    : initDataHeader;

  if (!initData) {
    throw new Error("TELEGRAM_INIT_DATA_MISSING");
  }

  const telegramUser = validateTelegramInitData(initData, botToken);

  if (!telegramUser) {
    throw new Error("TELEGRAM_INIT_DATA_INVALID");
  }

  const user = await prisma.user.upsert({
    where: {
      telegramId: BigInt(telegramUser.id),
    },
    update: {
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
    },
    create: {
      telegramId: BigInt(telegramUser.id),
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
    },
  });

  return user;
}