export type Category = {
  id: number;
  title: string;
};

export type ProductListItem = {
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

export type VariantImage = {
  id: number;
  productVariantId: number;
  url: string;
  sortOrder: number;
};

export type ProductVariant = {
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
  images: VariantImage[];
};

export type ProductDetails = {
  id: number;
  description: string;
  isActive: boolean;
  categoryId: number;
  categoryTitle: string;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
};

export type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

export type AdminOrder = {
  id: number;
  status: OrderStatus;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
  userId: number;
  telegramUser: {
    telegramId: string;
    username: string | null;
    firstName: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: number;
    productVariantId: number | null;
    title: string;
    price: number;
    quantity: number;
    totalPrice: number;
    currentVariant: {
      id: number;
      productId: number;
      title: string;
      optionLabel: string;
      price: number;
      maxQuantity: number;
      isActive: boolean;
      categoryTitle: string;
      imageUrl: string | null;
    } | null;
  }[];
};
