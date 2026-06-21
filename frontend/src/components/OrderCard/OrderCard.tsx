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
  productId: number | null;
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
  onProductOpen?: (productId: number, productVariantId?: number | null) => void;
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

export function OrderCard({ order, onProductOpen }: OrderCardProps) {
  return (
    <article className="order-card">
      <header className="order-card__header">
        <h2 className="order-card__title">Заказ №{order.id}</h2>
        <span className="order-card__date">{formatDate(order.createdAt)}</span>
      </header>

      <div className="order-card__items">
        {order.items.map((item) => (
          <div className="order-card-item" key={item.id}>
            <button
              className="order-card-item__image-box"
              type="button"
              aria-label="Открыть товар"
              disabled={!item.productId || !onProductOpen}
              onClick={() => {
                if (item.productId) {
                  onProductOpen?.(item.productId, item.productVariantId);
                }
              }}
            >
              {item.imageUrl ? (
                <img
                  className="order-card-item__image"
                  src={item.imageUrl}
                  alt={item.title}
                />
              ) : (
                <span className="order-card-item__image-placeholder">Фото</span>
              )}
            </button>

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
