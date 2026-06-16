import type { Order, OrderStatus } from "../OrderCard/OrderCard";
import "./CurrentOrderCard.css";

type CurrentOrderCardProps = {
  order: Order;
  onClick: (order: Order) => void;
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: "Оформлен",
  assembled: "Собран",
  in_delivery: "В доставке",
  waiting_pickup: "Ожидает получения",
  received: "Получен",
};

const MAX_IMAGES_WITHOUT_MORE_BLOCK = 4;
const MAX_IMAGES_WITH_MORE_BLOCK = 3;

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function MoreDotsIcon() {
  return (
    <svg
      className="current-order-card__more-icon"
      viewBox="0 0 24 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="3" cy="3" r="3" fill="currentColor" />
      <circle cx="12" cy="3" r="3" fill="currentColor" />
      <circle cx="21" cy="3" r="3" fill="currentColor" />
    </svg>
  );
}

export function CurrentOrderCard({ order, onClick }: CurrentOrderCardProps) {
  const hasMoreItems = order.items.length > MAX_IMAGES_WITHOUT_MORE_BLOCK;
  const maxPreviewImages = hasMoreItems
    ? MAX_IMAGES_WITH_MORE_BLOCK
    : MAX_IMAGES_WITHOUT_MORE_BLOCK;
  const previewItems = order.items.slice(0, maxPreviewImages);

  const statusClassName = [
    "current-order-card__status",
    order.status === "waiting_pickup"
      ? "current-order-card__status--waiting-pickup"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className="current-order-card"
      type="button"
      onClick={() => onClick(order)}
    >
      <div className="current-order-card__top">
        <h2 className="current-order-card__title">Заказ №{order.id}</h2>
        <span className={statusClassName}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="current-order-card__bottom">
        <div className="current-order-card__images" aria-hidden="true">
          {previewItems.map((item) => (
            <div className="current-order-card__image-box" key={item.id}>
              {item.imageUrl ? (
                <img
                  className="current-order-card__image"
                  src={item.imageUrl}
                  alt=""
                />
              ) : (
                <span className="current-order-card__image-placeholder">Фото</span>
              )}
            </div>
          ))}

          {hasMoreItems && (
            <div className="current-order-card__more-box">
              <MoreDotsIcon />
            </div>
          )}
        </div>

        <strong className="current-order-card__total-price">
          {formatPrice(order.totalPrice)}
        </strong>
      </div>
    </button>
  );
}
