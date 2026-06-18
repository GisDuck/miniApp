import "./OrderCard.css";

export type OrderStatus =
  | "CREATED"
  | "PREPARING"
  | "DELIVERING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED";

export type OrderItem = {
  id: number;
  productVariantId: number | null;
  title: string;
  quantity: number;
  price: number;
  imageUrl: string | null;
};

export type Order = {
  id: number;
  createdAt: string;
  updatedAt?: string;
  status: OrderStatus;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  itemsCount?: number;
  previewImages?: string[];
  totalPrice: number;
};

type OrderCardProps = {
  order: Order;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function OrderCard({ order }: OrderCardProps) {
  return (
    <article className="order-card">
      <header className="order-card__header">
        <h2 className="order-card__title">Заказ №{order.id}</h2>
        <span className="order-card__date">{formatDate(order.createdAt)}</span>
      </header>

      <div className="order-card__items">
        {order.items.map((item) => (
          <div className="order-card-item" key={item.id}>
            <div className="order-card-item__image-box">
              {item.imageUrl ? (
                <img
                  className="order-card-item__image"
                  src={item.imageUrl}
                  alt={item.title}
                />
              ) : (
                <div className="order-card-item__image-placeholder">Фото</div>
              )}
            </div>

            <div className="order-card-item__info">
              <strong className="order-card-item__title">{item.title}</strong>
              <span className="order-card-item__quantity">
                Количество: {item.quantity}
              </span>
            </div>

            <strong className="order-card-item__price">
              {formatPrice(item.price * item.quantity)}
            </strong>
          </div>
        ))}
      </div>

      <footer className="order-card__footer">
        <span className="order-card__total-label">Итог:</span>
        <strong className="order-card__total-price">
          {formatPrice(order.totalPrice)}
        </strong>
      </footer>
    </article>
  );
}
