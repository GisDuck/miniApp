export type Category = {
  id: string;
  title: string;
};

export type AdminImage = {
  id: string;
  uuid: string;
  index: number;
  url: string;
};

export type ProductListItem = {
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

export type ProductVariant = {
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

export type ProductDetails = {
  id: string;
  code: string;
  title: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  categoryTitle: string;
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
  items: {
    id: string;
    productVariantId: string | null;
    title: string;
    price: number;
    quantity: number;
    totalPrice: number;
    imageUrl: string | null;
  }[];
};

export type DeliveryMethod = {
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type PaymentMethod = {
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type PaymentAvailability = {
  deliveryMethodCode: string;
  paymentMethodCode: string;
};

export type PickupAddress = {
  id: number;
  title: string;
  address: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  startTimeMinutes: number;
  endTimeMinutes: number;
  slotStepMinutes: number;
};

export type PickupSlotReservation = {
  id: number;
  pickupAddressId: number;
  pickupAddressTitle: string;
  pickupDate: string;
  pickupTimeMinutes: number;
  status: string;
  moySkladOrderId: string | null;
  moySkladOrderName: string | null;
};

export type DeliverySettings = {
  methods: DeliveryMethod[];
  paymentMethods: PaymentMethod[];
  paymentAvailability: PaymentAvailability[];
  pickupAddresses: PickupAddress[];
  reservations: PickupSlotReservation[];
};
