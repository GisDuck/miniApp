export type SerializableProduct = {
  id: number;
  description: string;
  isActive: boolean;
  categoryId: number;
  categoryTitle: string;
  likesCount: number;
  variantsCount: number;
  inStockCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializableVariant = {
  id: number;
  productId: number;
  moySkladId: string;
  optionLabel: string;
  title: string;
  description: string | null;
  price: number;
  maxQuantity: number;
  isActive: boolean;
  sortOrder: number;
  images: SerializableImage[];
};

export type SerializableImage = {
  id: number;
  productVariantId: number;
  url: string;
  sortOrder: number;
};
