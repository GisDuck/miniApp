import type { ProductWithVariants } from "../types/product.types";

export function mapCatalogVariant(
  variant: ProductWithVariants["variants"][number],
) {
  const images = variant.images.map((image) => image.url);

  return {
    productVariantId: variant.id,
    title: variant.title,
    optionLabel: variant.optionLabel,
    description: variant.description,
    price: variant.price,
    imageUrl: images[0] ?? null,
    images,
    maxQuantity: variant.maxQuantity,
    isActive: variant.isActive,
  };
}

export function mapCatalogProduct(product: ProductWithVariants) {
  const variants = product.variants.map(mapCatalogVariant);
  const mainVariant =
    variants.find((variant) => variant.isActive && variant.maxQuantity > 0) ??
    variants[0];

  return {
    productId: product.id,
    categoryId: product.categoryId,
    categoryTitle: product.category.title,
    description: product.description,
    isActive: product.isActive,
    mainVariant,
    variants,
    isFavorite: product.favoriteItems.length > 0,
  };
}
