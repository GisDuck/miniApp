export type CreateOrderBody = {
  customerName?: string;
  customerPhone?: string;
  deliveryMethodCode?: string;
  pickupAddressId?: number;
  pickupDate?: string;
  pickupTime?: string;
};
