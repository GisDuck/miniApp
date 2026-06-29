export type CreateOrderBody = {
  customerName?: string;
  customerPhone?: string;
  deliveryMethodCode?: string;
  paymentMethodCode?: string;
  pickupAddressId?: number;
  pickupDate?: string;
  pickupTime?: string;
};
