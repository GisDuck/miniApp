CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "moySkladCounterpartyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramUser" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FavoriteItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_moySkladCounterpartyId_key"
ON "User"("moySkladCounterpartyId");

CREATE UNIQUE INDEX "TelegramUser_userId_key"
ON "TelegramUser"("userId");

CREATE UNIQUE INDEX "TelegramUser_telegramId_key"
ON "TelegramUser"("telegramId");

CREATE UNIQUE INDEX "FavoriteItem_userId_productId_key"
ON "FavoriteItem"("userId", "productId");

CREATE INDEX "FavoriteItem_productId_idx"
ON "FavoriteItem"("productId");

CREATE UNIQUE INDEX "CartItem_userId_productVariantId_key"
ON "CartItem"("userId", "productVariantId");

CREATE INDEX "CartItem_productVariantId_idx"
ON "CartItem"("productVariantId");

ALTER TABLE "TelegramUser"
ADD CONSTRAINT "TelegramUser_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FavoriteItem"
ADD CONSTRAINT "FavoriteItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
ADD CONSTRAINT "CartItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
