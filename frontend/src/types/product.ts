export type CatalogProductVariant = {
  productVariantId: number;
  title: string;
  optionLabel: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  images: string[];
  maxQuantity: number;
  isActive: boolean;
};

export type CatalogProduct = {
  productId: number;
  categoryId: number;
  categoryTitle: string;
  description: string;
  isActive: boolean;
  mainVariant: CatalogProductVariant;
  variants: CatalogProductVariant[];
  isFavorite: boolean;
};
