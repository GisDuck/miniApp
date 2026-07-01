import { prisma } from "../lib/prisma";
import { redisGetJson, redisSetJson } from "../lib/redis";
import { minio, minioBucket } from "../lib/minio";
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogProductVariant,
  CatalogSnapshot,
  MoySkladMeta,
} from "../types/catalog.types";
import {
  getMoySkladAvailableStocksByAssortments,
  getMoySkladAvailableStocksReport,
  getMoySkladAssortment,
  getMoySkladProductFolders,
  type MoySkladAssortmentRow,
} from "./moysklad.service";

const CATALOG_CACHE_KEY = "catalog:v1";
const CATALOG_CACHE_TTL_SECONDS = 60 * 60 * 48;
const IMAGE_BASE_URL = (
  process.env.PRODUCT_IMAGE_BASE_URL ?? "https://heartstore.tech/img"
).replace(/\/$/, "");
const IMAGE_MANIFEST_KEY = process.env.PRODUCT_IMAGE_MANIFEST_KEY ?? "img/manifest.json";

type ImageManifestValue =
  | number
  | {
      max?: number;
      count?: number;
    };

type ImageManifest =
  | Record<string, ImageManifestValue>
  | {
      items?: Record<string, ImageManifestValue>;
      images?: Record<string, ImageManifestValue>;
    };

type CatalogBuildProduct = {
  productId: string;
  meta: MoySkladMeta;
  code: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  description: string;
  isActive: boolean;
  variants: CatalogProductVariant[];
};

type CatalogMatch = {
  product: CatalogProduct;
  variant: CatalogProductVariant;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readMinioObjectAsBuffer(objectName: string) {
  const stream = await minio.getObject(minioBucket, objectName);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function loadImageManifest() {
  try {
    console.info("catalog_image_manifest_read_started", {
      bucket: minioBucket,
      key: IMAGE_MANIFEST_KEY,
    });

    const buffer = await readMinioObjectAsBuffer(IMAGE_MANIFEST_KEY);
    const manifest = JSON.parse(buffer.toString("utf8")) as ImageManifest;
    const source =
      isRecord(manifest) && isRecord(manifest.items)
        ? manifest.items
        : isRecord(manifest) && isRecord(manifest.images)
          ? manifest.images
          : manifest;
    const entries = new Map<string, number>();

    for (const [uuid, value] of Object.entries(source)) {
      if (typeof value === "number") {
        entries.set(uuid, value);
        continue;
      }

      if (isRecord(value) && typeof value.max === "number") {
        entries.set(uuid, value.max);
        continue;
      }

      if (isRecord(value) && typeof value.count === "number") {
        entries.set(uuid, Math.max(0, value.count - 1));
      }
    }

    console.info("catalog_image_manifest_read_completed", {
      bucket: minioBucket,
      key: IMAGE_MANIFEST_KEY,
      entriesCount: entries.size,
    });

    return entries;
  } catch (error) {
    console.warn("catalog_image_manifest_read_failed", {
      error,
      bucket: minioBucket,
      key: IMAGE_MANIFEST_KEY,
    });
    return new Map<string, number>();
  }
}

function getImages(uuid: string, manifest: Map<string, number>) {
  const maxIndex = manifest.get(uuid);

  if (maxIndex === undefined || maxIndex < 0) {
    return [];
  }

  return Array.from({ length: Math.floor(maxIndex) + 1 }, (_, index) => {
    return `${IMAGE_BASE_URL}/${uuid}/${index}.webp`;
  });
}

function getActiveAttribute(row: MoySkladAssortmentRow) {
  const activeAttribute = row.attributes?.find((attribute) => {
    return attribute.name?.toLowerCase() === "isactive";
  });

  return activeAttribute?.value !== false;
}

function getPrice(row: MoySkladAssortmentRow) {
  const configuredPriceType = process.env.MOYSKLAD_PRICE_TYPE_NAME;
  const price =
    (configuredPriceType
      ? row.salePrices?.find((salePrice) => {
          return salePrice.priceType?.name === configuredPriceType;
        })
      : row.salePrices?.[0]) ?? row.salePrices?.[0];

  return Math.round((price?.value ?? 0) / 100);
}

function getOptionLabel(row: MoySkladAssortmentRow) {
  const characteristics = row.characteristics
    ?.map((characteristic) => characteristic.value?.trim())
    .filter((value): value is string => Boolean(value));

  if (characteristics && characteristics.length > 0) {
    return characteristics.join(" / ");
  }

  return row.name;
}

function createVariant(
  row: MoySkladAssortmentRow,
  manifest: Map<string, number>,
): CatalogProductVariant {
  const images = getImages(row.id, manifest);

  return {
    productVariantId: row.id,
    meta: row.meta,
    code: row.code ?? row.id,
    title: row.name,
    optionLabel: getOptionLabel(row),
    description: row.description ?? null,
    price: getPrice(row),
    imageUrl: images[0] ?? null,
    images,
    maxQuantity: Math.max(0, Math.floor(row.stock ?? row.quantity ?? 0)),
    isActive: !row.archived && getActiveAttribute(row),
  };
}

function getCategoryTitle(row: MoySkladAssortmentRow) {
  return row.pathName?.trim() || "Без категории";
}

function makeProductFromRow(
  row: MoySkladAssortmentRow,
  foldersByHref: Map<string, CatalogCategory>,
): CatalogBuildProduct {
  const folder = row.productFolder?.meta.href
    ? foldersByHref.get(row.productFolder.meta.href)
    : null;

  return {
    productId: row.id,
    meta: row.meta,
    code: row.code ?? row.id,
    title: row.name,
    categoryId: folder?.id ?? row.productFolder?.meta.href ?? getCategoryTitle(row),
    categoryTitle: folder?.title ?? getCategoryTitle(row),
    description: row.description ?? "",
    isActive: !row.archived && getActiveAttribute(row),
    variants: [],
  };
}

function finalizeProduct(product: CatalogBuildProduct): CatalogProduct | null {
  const variants = product.variants.sort((firstVariant, secondVariant) => {
    return firstVariant.title.localeCompare(secondVariant.title, "ru");
  });

  if (variants.length === 0) {
    return null;
  }

  const mainVariant =
    variants.find((variant) => variant.isActive && variant.maxQuantity > 0) ??
    variants[0];

  return {
    ...product,
    variants,
    mainVariant,
    isFavorite: false,
  };
}

async function applyAvailableStocksToBuildProducts(
  products: CatalogBuildProduct[],
) {
  const availableStocks = await getMoySkladAvailableStocksReport();
  const availableStockById = new Map(
    availableStocks.map((stock) => [stock.assortmentId, stock.availableQuantity]),
  );

  for (const product of products) {
    product.variants = product.variants.map((variant) => {
      const availableQuantity = availableStockById.get(variant.productVariantId);

      if (availableQuantity === undefined) {
        return {
          ...variant,
          maxQuantity: 0,
        };
      }

      return {
        ...variant,
        maxQuantity: availableQuantity,
      };
    });
  }
}

async function applyFavorites(
  products: CatalogProduct[],
  userId: number,
): Promise<CatalogProduct[]> {
  const favoriteItems = await prisma.favoriteItem.findMany({
    where: {
      userId,
    },
    select: {
      productId: true,
    },
  });
  const favoriteProductIds = new Set(
    favoriteItems.map((favoriteItem) => favoriteItem.productId),
  );

  return products.map((product) => ({
    ...product,
    isFavorite: favoriteProductIds.has(product.productId),
  }));
}

export async function refreshCatalogCache() {
  console.info("catalog_refresh_started");

  const [folders, assortmentRows, imageManifest] = await Promise.all([
    getMoySkladProductFolders(),
    getMoySkladAssortment(),
    loadImageManifest(),
  ]);
  const foldersByHref = new Map<string, CatalogCategory>();

  for (const folder of folders) {
    if (folder.archived) {
      continue;
    }

    foldersByHref.set(folder.meta.href, {
      id: folder.id,
      title: folder.pathName ? `${folder.pathName}/${folder.name}` : folder.name,
    });
  }

  const productsById = new Map<string, CatalogBuildProduct>();
  const variantRows: MoySkladAssortmentRow[] = [];

  for (const row of assortmentRows) {
    if (row.meta.type === "variant") {
      variantRows.push(row);
      continue;
    }

    const product = makeProductFromRow(row, foldersByHref);
    productsById.set(product.productId, product);

    if (!row.variantsCount) {
      product.variants.push(createVariant(row, imageManifest));
    }
  }

  for (const row of variantRows) {
    const productId = row.product?.meta.href?.split("/").pop();

    if (!productId) {
      continue;
    }

    let product = productsById.get(productId);

    if (!product) {
      product = {
        productId,
        meta: row.product?.meta ?? row.meta,
        code: productId,
        title: row.name,
        categoryId: getCategoryTitle(row),
        categoryTitle: getCategoryTitle(row),
        description: row.description ?? "",
        isActive: true,
        variants: [],
      };
      productsById.set(productId, product);
    }

    product.variants.push(createVariant(row, imageManifest));
  }

  const buildProducts = Array.from(productsById.values());

  await applyAvailableStocksToBuildProducts(buildProducts);

  const products = buildProducts
    .map(finalizeProduct)
    .filter((product): product is CatalogProduct => Boolean(product))
    .filter((product) => product.isActive)
    .sort((firstProduct, secondProduct) => {
      return firstProduct.title.localeCompare(secondProduct.title, "ru");
    });
  const categoryMap = new Map<string, CatalogCategory>();

  for (const product of products) {
    categoryMap.set(product.categoryId, {
      id: product.categoryId,
      title: product.categoryTitle,
    });
  }

  const snapshot: CatalogSnapshot = {
    products,
    categories: Array.from(categoryMap.values()).sort((first, second) =>
      first.title.localeCompare(second.title, "ru"),
    ),
    refreshedAt: new Date().toISOString(),
  };

  await redisSetJson(CATALOG_CACHE_KEY, snapshot, CATALOG_CACHE_TTL_SECONDS);

  console.info("catalog_refresh_completed", {
    refreshedAt: snapshot.refreshedAt,
    productsCount: snapshot.products.length,
    categoriesCount: snapshot.categories.length,
  });

  return snapshot;
}

export async function getCatalogSnapshot() {
  const snapshot = await redisGetJson<CatalogSnapshot>(CATALOG_CACHE_KEY);

  if (snapshot) {
    return snapshot;
  }

  console.info("catalog_cache_miss_refresh_started");
  return refreshCatalogCache();
}

export async function getCatalogProducts(userId: number) {
  const snapshot = await getCatalogSnapshot();

  return applyFavorites(snapshot.products, userId);
}

export async function getCatalogCategories() {
  const snapshot = await getCatalogSnapshot();

  return [
    {
      id: "all",
      title: "Все",
    },
    ...snapshot.categories,
  ];
}

export async function findCatalogProduct(productId: string, userId?: number) {
  const snapshot = await getCatalogSnapshot();
  const product = snapshot.products.find((item) => item.productId === productId);

  if (!product) {
    return null;
  }

  if (userId === undefined) {
    return product;
  }

  const [productWithFavorite] = await applyFavorites([product], userId);

  return productWithFavorite;
}

export async function findCatalogVariant(productVariantId: string) {
  const snapshot = await getCatalogSnapshot();

  for (const product of snapshot.products) {
    const variant = product.variants.find((item) => {
      return item.productVariantId === productVariantId;
    });

    if (variant) {
      return {
        product,
        variant,
      } satisfies CatalogMatch;
    }
  }

  return null;
}

export async function incrementCatalogVariantStocks(
  items: Array<{
    productVariantId: string | null | undefined;
    quantity: number;
  }>,
) {
  const increments = new Map<string, number>();

  for (const item of items) {
    const quantity = Math.trunc(item.quantity);

    if (!item.productVariantId || quantity <= 0) {
      continue;
    }

    increments.set(
      item.productVariantId,
      (increments.get(item.productVariantId) ?? 0) + quantity,
    );
  }

  if (increments.size === 0) {
    console.info("catalog_variant_stocks_increment_skipped_without_items");
    return null;
  }

  const snapshot = await redisGetJson<CatalogSnapshot>(CATALOG_CACHE_KEY);

  if (!snapshot) {
    console.info("catalog_variant_stocks_increment_skipped_without_cache", {
      productVariantIds: Array.from(increments.keys()),
    });
    return null;
  }

  const foundVariantIds = new Set<string>();
  const nextSnapshot: CatalogSnapshot = {
    ...snapshot,
    refreshedAt: new Date().toISOString(),
    products: snapshot.products.map((product) => {
      const variants = product.variants.map((variant) => {
        const increment = increments.get(variant.productVariantId);

        if (increment === undefined) {
          return variant;
        }

        foundVariantIds.add(variant.productVariantId);

        return {
          ...variant,
          maxQuantity: Math.max(0, variant.maxQuantity + increment),
        };
      });
      const mainVariant =
        variants.find((variant) => variant.isActive && variant.maxQuantity > 0) ??
        variants[0];

      return {
        ...product,
        variants,
        mainVariant,
      };
    }),
  };
  const missingVariantIds = Array.from(increments.keys()).filter((id) => {
    return !foundVariantIds.has(id);
  });

  if (missingVariantIds.length > 0) {
    console.warn("catalog_variant_stocks_increment_missing_variants", {
      productVariantIds: missingVariantIds,
    });
  }

  await redisSetJson(CATALOG_CACHE_KEY, nextSnapshot, CATALOG_CACHE_TTL_SECONDS);

  console.info("catalog_variant_stocks_increment_completed", {
    refreshedAt: nextSnapshot.refreshedAt,
    stocks: Array.from(increments.entries()).map(([productVariantId, quantity]) => ({
      productVariantId,
      quantity,
    })),
  });

  return nextSnapshot;
}

export async function refreshCatalogVariantStocks(productVariantIds: string[]) {
  const uniqueIds = Array.from(new Set(productVariantIds));

  if (uniqueIds.length === 0) {
    return getCatalogSnapshot();
  }

  console.info("catalog_variant_stocks_refresh_started", {
    productVariantIds: uniqueIds,
  });

  const snapshot = await getCatalogSnapshot();
  const stocks = new Map<string, number>();

  try {
    const assortments = snapshot.products.flatMap((product) => {
      return product.variants
        .filter((variant) => uniqueIds.includes(variant.productVariantId))
        .map((variant) => ({
          id: variant.productVariantId,
          meta: variant.meta,
        }));
    });
    const rows = await getMoySkladAvailableStocksByAssortments(assortments);
    const rowsById = new Map(rows.map((row) => [row.assortmentId, row]));

    for (const productVariantId of uniqueIds) {
      const row = rowsById.get(productVariantId);

      if (!row) {
        console.warn("catalog_variant_stock_row_missing", {
          productVariantId,
        });
        continue;
      }

      stocks.set(
        productVariantId,
        row.availableQuantity,
      );
    }
  } catch (error) {
    console.error("catalog_variant_stocks_refresh_failed", {
      error,
      productVariantIds: uniqueIds,
    });
    throw error;
  }

  const nextSnapshot: CatalogSnapshot = {
    ...snapshot,
    refreshedAt: new Date().toISOString(),
    products: snapshot.products.map((product) => {
      const variants = product.variants.map((variant) => {
        const nextStock = stocks.get(variant.productVariantId);

        if (nextStock === undefined) {
          return variant;
        }

        return {
          ...variant,
          maxQuantity: nextStock,
        };
      });
      const mainVariant =
        variants.find((variant) => variant.isActive && variant.maxQuantity > 0) ??
        variants[0];

      return {
        ...product,
        variants,
        mainVariant,
      };
    }),
  };

  await redisSetJson(CATALOG_CACHE_KEY, nextSnapshot, CATALOG_CACHE_TTL_SECONDS);

  console.info("catalog_variant_stocks_refresh_completed", {
    refreshedAt: nextSnapshot.refreshedAt,
    stocks: Array.from(stocks.entries()).map(([productVariantId, stock]) => ({
      productVariantId,
      stock,
    })),
  });

  return nextSnapshot;
}
