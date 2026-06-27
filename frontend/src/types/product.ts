export type CatalogProductVariant = {
  productVariantId: string;
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
  productId: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  description: string;
  isActive: boolean;
  mainVariant: CatalogProductVariant;
  variants: CatalogProductVariant[];
  isFavorite: boolean;
};
