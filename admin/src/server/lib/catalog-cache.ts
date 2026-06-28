import type { AdminImage } from "../types.js";
import { redisGetJson, redisSetJson } from "./redis.js";

const CATALOG_CACHE_KEY = "catalog:v1";
const CATALOG_CACHE_TTL_SECONDS = 60 * 60 * 48;
const IMAGE_BASE_URL = (
  process.env.PRODUCT_IMAGE_BASE_URL ?? "https://heartstore.tech/img"
).replace(/\/+$/, "");

type CatalogCacheLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

type CachedCatalogVariant = {
  productVariantId: string;
  imageUrl: string | null;
  images: string[];
  [key: string]: unknown;
};

type CachedCatalogProduct = {
  mainVariant?: CachedCatalogVariant;
  variants?: CachedCatalogVariant[];
  [key: string]: unknown;
};

type CachedCatalogSnapshot = {
  products?: CachedCatalogProduct[];
  refreshedAt?: string;
  [key: string]: unknown;
};

function toPublicImageUrls(images: AdminImage[]) {
  return images
    .slice()
    .sort((first, second) => first.index - second.index)
    .map((image) => `${IMAGE_BASE_URL}/${image.uuid}/${image.index}.webp`);
}

function applyImagesToVariant(
  variant: CachedCatalogVariant,
  productVariantId: string,
  images: string[],
) {
  if (variant.productVariantId !== productVariantId) {
    return variant;
  }

  return {
    ...variant,
    imageUrl: images[0] ?? null,
    images,
  };
}

export async function updateCatalogVariantImages(
  productVariantId: string,
  images: AdminImage[],
  logger?: CatalogCacheLogger,
) {
  try {
    const snapshot = await redisGetJson<CachedCatalogSnapshot>(CATALOG_CACHE_KEY);

    if (!snapshot || !Array.isArray(snapshot.products)) {
      logger?.warn(
        {
          productVariantId,
          cacheKey: CATALOG_CACHE_KEY,
        },
        "admin_catalog_image_cache_missing",
      );
      return false;
    }

    const publicImages = toPublicImageUrls(images);
    let changed = false;

    const products = snapshot.products.map((product) => {
      let productChanged = false;
      const mainVariant = product.mainVariant
        ? applyImagesToVariant(product.mainVariant, productVariantId, publicImages)
        : product.mainVariant;
      const variants = Array.isArray(product.variants)
        ? product.variants.map((variant) => {
            const nextVariant = applyImagesToVariant(
              variant,
              productVariantId,
              publicImages,
            );

            if (nextVariant !== variant) {
              productChanged = true;
            }

            return nextVariant;
          })
        : product.variants;

      if (mainVariant !== product.mainVariant) {
        productChanged = true;
      }

      if (!productChanged) {
        return product;
      }

      changed = true;
      return {
        ...product,
        mainVariant,
        variants,
      };
    });

    if (!changed) {
      logger?.warn(
        {
          productVariantId,
          cacheKey: CATALOG_CACHE_KEY,
        },
        "admin_catalog_image_cache_variant_not_found",
      );
      return false;
    }

    await redisSetJson(
      CATALOG_CACHE_KEY,
      {
        ...snapshot,
        products,
        refreshedAt: new Date().toISOString(),
      },
      CATALOG_CACHE_TTL_SECONDS,
    );

    logger?.info(
      {
        productVariantId,
        imagesCount: publicImages.length,
        cacheKey: CATALOG_CACHE_KEY,
      },
      "admin_catalog_image_cache_updated",
    );

    return true;
  } catch (error) {
    logger?.error(
      {
        err: error,
        productVariantId,
        imagesCount: images.length,
        cacheKey: CATALOG_CACHE_KEY,
      },
      "admin_catalog_image_cache_update_failed",
    );
    return false;
  }
}
