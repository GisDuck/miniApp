export type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

export type AdminImage = {
  id: string;
  uuid: string;
  index: number;
  url: string;
};

export type AdminProductVariant = {
  id: string;
  productId: string;
  code: string;
  optionLabel: string;
  title: string;
  description: string | null;
  price: number;
  maxQuantity: number;
  isActive: boolean;
  images: AdminImage[];
};

export type AdminProductListItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  categoryTitle: string;
  previewImageUrl: string | null;
  variantsCount: number;
  inStockCount: number;
  updatedAt: string | null;
};

export type AdminProductDetails = {
  id: string;
  code: string;
  title: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  categoryTitle: string;
  variants: AdminProductVariant[];
};

export type AdminOrder = {
  id: string;
  name: string;
  status: OrderStatus;
  stateName: string | null;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
  shipmentAddress: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productVariantId: string | null;
    title: string;
    price: number;
    quantity: number;
    totalPrice: number;
    imageUrl: string | null;
  }>;
};
