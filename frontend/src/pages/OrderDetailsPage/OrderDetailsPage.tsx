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
  const shouldShowEditButton =
    order.status !== "COMPLETED" && order.status !== "CANCELED";
  const shouldShowCancelButton =
    order.status !== "COMPLETED" && order.status !== "CANCELED";
  const canEdit = order.canEdit ?? true;

  return (
    <section className="order-details-page">
      <header className="order-details-page__header">
        <h1 className="order-details-page__title">Подробности заказа</h1>
      </header>

      <div className="order-details-page__content">
        <OrderCard order={order} onProductOpen={onProductOpen} />

        <section className="order-details-page__info">
          {order.customerPhone && (
            <div className="order-details-page__info-row">
              <span>Телефон</span>
              <strong>{order.customerPhone}</strong>
            </div>
          )}

          {order.deliveryType && (
            <div className="order-details-page__info-row">
              <span>Способ доставки</span>
              <strong>{order.deliveryType}</strong>
            </div>
          )}

          {order.comment && (
            <p className="order-details-page__comment">{order.comment}</p>
          )}
        </section>

        {(shouldShowCancelButton || shouldShowEditButton) && (
          <div className="order-details-page__actions">
            {shouldShowCancelButton && (
              <button
                className="order-details-page__button order-details-page__button--cancel"
                type="button"
                onClick={() => onCancel(order)}
              >
                Отменить
              </button>
            )}

            {shouldShowEditButton && (
              <div className="order-details-page__edit-action">
                <button
                  className="order-details-page__button order-details-page__button--edit"
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onEdit(order)}
                >
                  Изменить
                </button>

                {!canEdit && order.editDisabledReason && (
                  <p className="order-details-page__edit-reason">
                    {order.editDisabledReason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
