import type { FastifyRequest } from "fastify";

import { prisma } from "../lib/prisma";
import { validateTelegramInitData } from "../utils/telegram";

export async function getCurrentUser(request: FastifyRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    request.log.error("telegram_bot_token_missing");
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const initDataHeader = request.headers["x-telegram-init-data"];
  const initData = Array.isArray(initDataHeader)
    ? initDataHeader[0]
    : initDataHeader;

  if (!initData) {
    request.log.warn("telegram_init_data_missing");
    throw new Error("TELEGRAM_INIT_DATA_MISSING");
  }

  const telegramUser = validateTelegramInitData(initData, botToken);

  if (!telegramUser) {
    request.log.warn("telegram_init_data_invalid");
    throw new Error("TELEGRAM_INIT_DATA_INVALID");
  }

  request.log.info(
    {
      telegramId: String(telegramUser.id),
    },
    "telegram_user_upsert_started",
  );
  const telegramUserRecord = await prisma.telegramUser.upsert({
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
      user: {
        create: {},
      },
    },
    include: {
      user: true,
    },
  });

  request.log.info(
    {
      telegramId: String(telegramUser.id),
      userId: telegramUserRecord.user.id,
    },
    "telegram_user_upsert_completed",
  );

  return telegramUserRecord.user;
}
