import CloseIcon from "../../assets/icons/close.svg?react";
import { OrderCard, type Order } from "../OrderCard/OrderCard";
import "./OrderDetailsModal.css";

type OrderDetailsModalProps = {
  order: Order;
  onClose: () => void;
  onCancel: (order: Order) => void;
  onEdit: (order: Order) => void;
  onProductOpen: (productId: number) => void;
};

export function OrderDetailsModal({
  order,
  onClose,
  onCancel,
  onEdit,
  onProductOpen,
}: OrderDetailsModalProps) {
  return (
    <div className="order-details-modal">
      <button
        className="order-details-modal__backdrop"
        type="button"
        aria-label="Закрыть подробности заказа"
        onClick={onClose}
      />

      <div className="order-details-modal__panel" role="dialog" aria-modal="true">
        <header className="order-details-modal__header">
          <h2 className="order-details-modal__title">Подробности заказа</h2>

          <button
            className="order-details-modal__close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <CloseIcon className="order-details-modal__close-icon" />
          </button>
        </header>

        <div className="order-details-modal__content">
          <OrderCard order={order} onProductOpen={onProductOpen} />

          <div className="order-details-modal__actions">
            <button
              className="order-details-modal__button order-details-modal__button--cancel"
              type="button"
              onClick={() => onCancel(order)}
            >
              Отменить
            </button>

            <button
              className="order-details-modal__button order-details-modal__button--edit"
              type="button"
              onClick={() => onEdit(order)}
            >
              Изменить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
