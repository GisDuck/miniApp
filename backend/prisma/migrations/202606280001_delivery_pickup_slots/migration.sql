CREATE TABLE "DeliveryMethod" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PickupAddress" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startTimeMinutes" INTEGER NOT NULL DEFAULT 600,
    "endTimeMinutes" INTEGER NOT NULL DEFAULT 1200,
    "slotStepMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PickupSlotReservation" (
    "id" SERIAL NOT NULL,
    "pickupAddressId" INTEGER NOT NULL,
    "pickupDate" DATE NOT NULL,
    "pickupTimeMinutes" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "moySkladOrderId" TEXT,
    "moySkladOrderName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupSlotReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryMethod_code_key" ON "DeliveryMethod"("code");

CREATE UNIQUE INDEX "PickupSlotReservation_pickupAddressId_pickupDate_pickupTimeMinutes_key"
ON "PickupSlotReservation"("pickupAddressId", "pickupDate", "pickupTimeMinutes");

CREATE INDEX "PickupSlotReservation_userId_idx" ON "PickupSlotReservation"("userId");

CREATE INDEX "PickupSlotReservation_status_expiresAt_idx" ON "PickupSlotReservation"("status", "expiresAt");

ALTER TABLE "PickupSlotReservation"
ADD CONSTRAINT "PickupSlotReservation_pickupAddressId_fkey"
FOREIGN KEY ("pickupAddressId") REFERENCES "PickupAddress"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PickupSlotReservation"
ADD CONSTRAINT "PickupSlotReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DeliveryMethod" ("code", "title", "isActive", "sortOrder", "updatedAt")
VALUES
  ('pickup', 'Самовывоз', true, 10, NOW()),
  ('cdek', 'Доставка CDEK', false, 20, NOW()),
  ('yandex_express', 'Экспресс доставка Яндекс', false, 30, NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
