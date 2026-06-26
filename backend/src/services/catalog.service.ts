import { prisma } from "../lib/prisma";
import { redisGetJson, redisSetJson } from "../lib/redis";
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogProductVariant,
  CatalogSnapshot,
  MoySkladMeta,
} from "../types/catalog.types";
import {
  getMoySkladAssortment,
  getMoySkladProductFolders,
  getMoySkladStockByAssortmentId,
  type MoySkladAssortmentRow,
} from "./moysklad.service";

const CATALOG_CACHE_KEY = "catalog:v1";
const CATALOG_CACHE_TTL_SECONDS = 60 * 60 * 48;
const IMAGE_BASE_URL = (
  process.env.PRODUCT_IMAGE_BASE_URL ?? "https://heartstore.tech/img"
).replace(/\/$/, "");
const IMAGE_MANIFEST_URL =
  process.env.PRODUCT_IMAGE_MANIFEST_URL ?? `${IMAGE_BASE_URL}/manifest.json`;

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

async function loadImageManifest() {
  try {
    const response = await fetch(IMAGE_MANIFEST_URL);

    if (!response.ok) {
      return new Map<string, number>();
    }

    const manifest = (await response.json()) as ImageManifest;
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

    return entries;
  } catch {
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
  const characteristic = row.characteristics?.[0];

  if (characteristic?.value) {
    return characteristic.value;
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

  const products = Array.from(productsById.values())
    .map(finalizeProduct)
    .filter((product): product is CatalogProduct => Boolean(product))
    .filter((product) => product.isActive)
    .sort((firstProduct, secondProduct) => {
      return firstProduct.mainVariant.title.localeCompare(
        secondProduct.mainVariant.title,
        "ru",
      );
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

  return snapshot;
}

export async function getCatalogSnapshot() {
  const snapshot = await redisGetJson<CatalogSnapshot>(CATALOG_CACHE_KEY);

  if (snapshot) {
    return snapshot;
  }

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

export async function refreshCatalogVariantStocks(productVariantIds: string[]) {
  const uniqueIds = Array.from(new Set(productVariantIds));

  if (uniqueIds.length === 0) {
    return getCatalogSnapshot();
  }

  const snapshot = await getCatalogSnapshot();
  const stocks = new Map<string, number>();

  await Promise.all(
    uniqueIds.map(async (productVariantId) => {
      stocks.set(productVariantId, await getMoySkladStockByAssortmentId(productVariantId));
    }),
  );

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

  return nextSnapshot;
}
