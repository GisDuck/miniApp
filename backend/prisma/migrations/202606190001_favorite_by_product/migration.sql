-- Move favorites from product variants to whole products.
ALTER TABLE "FavoriteItem" ADD COLUMN "productId" INTEGER;

UPDATE "FavoriteItem" AS favorite
SET "productId" = variant."productId"
FROM "ProductVariant" AS variant
WHERE favorite."productVariantId" = variant."id";

DELETE FROM "FavoriteItem" AS duplicate
USING "FavoriteItem" AS original
WHERE duplicate."id" > original."id"
  AND duplicate."userId" = original."userId"
  AND duplicate."productId" = original."productId";

ALTER TABLE "FavoriteItem" DROP CONSTRAINT "FavoriteItem_productVariantId_fkey";
DROP INDEX "FavoriteItem_userId_productVariantId_key";
ALTER TABLE "FavoriteItem" DROP COLUMN "productVariantId";
ALTER TABLE "FavoriteItem" ALTER COLUMN "productId" SET NOT NULL;

CREATE UNIQUE INDEX "FavoriteItem_userId_productId_key" ON "FavoriteItem"("userId", "productId");

ALTER TABLE "FavoriteItem"
ADD CONSTRAINT "FavoriteItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
