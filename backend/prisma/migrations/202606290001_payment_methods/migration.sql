CREATE TABLE "PaymentMethod" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryMethodPaymentMethod" (
    "id" SERIAL NOT NULL,
    "deliveryMethodId" INTEGER NOT NULL,
    "paymentMethodId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryMethodPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");

CREATE UNIQUE INDEX "DeliveryMethodPaymentMethod_deliveryMethodId_paymentMethodId_key"
ON "DeliveryMethodPaymentMethod"("deliveryMethodId", "paymentMethodId");

CREATE INDEX "DeliveryMethodPaymentMethod_paymentMethodId_idx"
ON "DeliveryMethodPaymentMethod"("paymentMethodId");

ALTER TABLE "DeliveryMethodPaymentMethod"
ADD CONSTRAINT "DeliveryMethodPaymentMethod_deliveryMethodId_fkey"
FOREIGN KEY ("deliveryMethodId") REFERENCES "DeliveryMethod"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryMethodPaymentMethod"
ADD CONSTRAINT "DeliveryMethodPaymentMethod_paymentMethodId_fkey"
FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PaymentMethod" ("code", "title", "isActive", "sortOrder", "updatedAt")
VALUES
  ('cash', 'Наличные', true, 10, NOW()),
  ('card', 'Карта', true, 20, NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();

INSERT INTO "DeliveryMethodPaymentMethod" ("deliveryMethodId", "paymentMethodId")
SELECT delivery."id", payment."id"
FROM "DeliveryMethod" delivery
JOIN "PaymentMethod" payment ON payment."code" IN ('cash', 'card')
WHERE delivery."code" = 'pickup'
ON CONFLICT ("deliveryMethodId", "paymentMethodId") DO NOTHING;

INSERT INTO "DeliveryMethodPaymentMethod" ("deliveryMethodId", "paymentMethodId")
SELECT delivery."id", payment."id"
FROM "DeliveryMethod" delivery
JOIN "PaymentMethod" payment ON payment."code" = 'card'
WHERE delivery."code" IN ('cdek', 'yandex_express')
ON CONFLICT ("deliveryMethodId", "paymentMethodId") DO NOTHING;
