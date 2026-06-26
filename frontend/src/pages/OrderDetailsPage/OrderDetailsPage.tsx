import { OrderCard, type Order } from "../../components/OrderCard/OrderCard";
import "./OrderDetailsPage.css";

type OrderDetailsPageProps = {
  order: Order;
  onCancel: (order: Order) => void;
  onEdit: (order: Order) => void;
  onProductOpen: (productId: string, productVariantId?: string | null) => void;
};

export function OrderDetailsPage({
  order,
  onCancel,
  onEdit,
  onProductOpen,
}: OrderDetailsPageProps) {
  return (
    <section className="order-details-page">
      <header className="order-details-page__header">
        <h1 className="order-details-page__title">Подробности заказа</h1>
      </header>

      <div className="order-details-page__content">
        <OrderCard order={order} onProductOpen={onProductOpen} />

        <div className="order-details-page__actions">
          <button
            className="order-details-page__button order-details-page__button--cancel"
            type="button"
            onClick={() => onCancel(order)}
          >
            Отменить
          </button>

          <button
            className="order-details-page__button order-details-page__button--edit"
            type="button"
            onClick={() => onEdit(order)}
          >
            Изменить
          </button>
        </div>
      </div>
    </section>
  );
}
