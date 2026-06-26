export type CatalogProductVariant = {
  productVariantId: string;
  meta: MoySkladMeta;
  code: string;
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
  meta: MoySkladMeta;
  code: string;
  categoryId: string;
  categoryTitle: string;
  description: string;
  isActive: boolean;
  mainVariant: CatalogProductVariant;
  variants: CatalogProductVariant[];
  isFavorite: boolean;
};

export type CatalogCategory = {
  id: string;
  title: string;
};

export type CatalogSnapshot = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  refreshedAt: string;
};

export type MoySkladMeta = {
  href: string;
  metadataHref?: string;
  type: string;
  mediaType: string;
  uuidHref?: string;
};
