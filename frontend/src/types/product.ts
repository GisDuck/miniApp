export type CatalogProduct = {
  productId: number;
  productVariantId: number;
  categoryId: number;
  categoryTitle: string;
  title: string;
  optionLabel: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  maxQuantity: number;
  isActive: boolean;
  isFavorite: boolean;
};
