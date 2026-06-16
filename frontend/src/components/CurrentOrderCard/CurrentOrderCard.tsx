import type { Order, OrderStatus } from "../OrderCard/OrderCard";
import PlusIcon from "../../assets/icons/plus.svg?react";
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

const MAX_PREVIEW_IMAGES = 3;

export function CurrentOrderCard({ order, onClick }: CurrentOrderCardProps) {
  const previewItems = order.items.slice(0, MAX_PREVIEW_IMAGES);
  const hasMoreItems = order.items.length > MAX_PREVIEW_IMAGES;

  return (
    <button
      className="current-order-card"
      type="button"
      onClick={() => onClick(order)}
    >
      <div className="current-order-card__top">
        <h2 className="current-order-card__title">Заказ №{order.id}</h2>
        <span className="current-order-card__status">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

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
            <PlusIcon className="current-order-card__more-icon" />
          </div>
        )}
      </div>
    </button>
  );
}
