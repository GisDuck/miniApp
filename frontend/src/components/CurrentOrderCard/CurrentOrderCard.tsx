import type { Order, OrderStatus } from "../OrderCard/OrderCard";
import "./CurrentOrderCard.css";

import ThreeDotsIcon from "../../assets/icons/threeDots.svg?react";

type CurrentOrderCardProps = {
  order: Order;
  onClick: (order: Order) => void;
  onProductOpen: (productId: string, productVariantId?: string | null) => void;
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: "Оформлен",
  PREPARING: "Собираем",
  DELIVERING: "В пути",
  READY_FOR_PICKUP: "Ожидает получения",
  COMPLETED: "Завершен",
  CANCELED: "Отменен",
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

export function CurrentOrderCard({
  order,
  onClick,
  onProductOpen,
}: CurrentOrderCardProps) {
  const hasMoreItems = order.items.length > MAX_IMAGES_WITHOUT_MORE_BLOCK;
  const maxPreviewImages = hasMoreItems
    ? MAX_IMAGES_WITH_MORE_BLOCK
    : MAX_IMAGES_WITHOUT_MORE_BLOCK;
  const previewItems = order.items.slice(0, maxPreviewImages);

  const statusClassName = [
    "current-order-card__status",
    order.status === "READY_FOR_PICKUP"
      ? "current-order-card__status--waiting-pickup"
      : "",
    order.status === "CANCELED" ? "current-order-card__status--canceled" : "",
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
        <h2 className="current-order-card__title">Заказ №{order.name ?? order.id}</h2>
        <span className={statusClassName}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="current-order-card__bottom">
        <div className="current-order-card__images">
          {previewItems.map((item) => (
            <span
              className="current-order-card__image-box"
              key={item.id}
              role={item.productId ? "button" : undefined}
              tabIndex={item.productId ? 0 : undefined}
              aria-label={item.productId ? "Открыть товар" : undefined}
              onClick={(event) => {
                if (!item.productId) {
                  return;
                }

                event.stopPropagation();
                onProductOpen(item.productId, item.productVariantId);
              }}
              onKeyDown={(event) => {
                if (!item.productId) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onProductOpen(item.productId, item.productVariantId);
                }
              }}
            >
              {item.imageUrl ? (
                <img
                  className="current-order-card__image"
                  src={item.imageUrl}
                  alt=""
                />
              ) : (
                <span className="current-order-card__image-placeholder">Фото</span>
              )}
            </span>
          ))}

          {hasMoreItems && (
            <div className="current-order-card__more-box">
              <ThreeDotsIcon />
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
