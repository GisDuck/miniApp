import { OrderCard, type Order } from "../../components/OrderCard/OrderCard";
import { TextButton } from "../../components/TextButton/TextButton";
import "./OrderDetailsPage.css";

type OrderDetailsPageProps = {
  order: Order;
  onCancel: (order: Order) => void;
  onEdit: (order: Order) => void;
  onRepeat?: (order: Order) => void;
  onProductOpen: (productId: string, productVariantId?: string | null) => void;
  isRepeating?: boolean;
};

function formatPickupDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const formattedDate = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);

  return `${formattedDate}, ${match[4]}:${match[5]}`;
}

export function OrderDetailsPage({
  order,
  onCancel,
  onEdit,
  onRepeat,
  onProductOpen,
  isRepeating = false,
}: OrderDetailsPageProps) {
  const shouldShowEditButton =
    order.status !== "COMPLETED" && order.status !== "CANCELED";
  const shouldShowCancelButton =
    order.status !== "COMPLETED" && order.status !== "CANCELED";
  const shouldShowRepeatButton = order.status === "CANCELED" && Boolean(onRepeat);
  const canEdit = order.canEdit ?? true;
  const pickupDateTimeText = formatPickupDateTime(order.pickupDateTime);
  const isPickup = order.deliveryMethodCode === "pickup";

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

          {order.paymentType && (
            <div className="order-details-page__info-row">
              <span>Способ оплаты</span>
              <strong>{order.paymentType}</strong>
            </div>
          )}

          {order.receivingAddress && (
            <div className="order-details-page__info-row">
              <span>Адрес получения</span>
              <strong>{order.receivingAddress}</strong>
            </div>
          )}

          {isPickup && pickupDateTimeText && (
            <div className="order-details-page__info-row">
              <span>Дата и время самовывоза</span>
              <strong>{pickupDateTimeText}</strong>
            </div>
          )}
        </section>

        {(shouldShowCancelButton || shouldShowEditButton || shouldShowRepeatButton) && (
          <div className="order-details-page__actions">
            {shouldShowCancelButton && (
              <TextButton
                className="order-details-page__button order-details-page__button--cancel"
                type="button"
                textColor="var(--color-status-danger)"
                borderColor="var(--color-status-danger)"
                fillColor="transparent"
                fullWidth
                onClick={() => onCancel(order)}
              >
                Отменить
              </TextButton>
            )}

            {shouldShowEditButton && (
              <div className="order-details-page__edit-action">
                <TextButton
                  className="order-details-page__button order-details-page__button--edit"
                  type="button"
                  disabled={!canEdit}
                  fullWidth
                  onClick={() => onEdit(order)}
                >
                  Изменить
                </TextButton>

                {!canEdit && order.editDisabledReason && (
                  <p className="order-details-page__edit-reason">
                    {order.editDisabledReason}
                  </p>
                )}
              </div>
            )}

            {shouldShowRepeatButton && (
              <div className="order-details-page__repeat-action">
                <TextButton
                  className="order-details-page__button order-details-page__button--edit"
                  type="button"
                  disabled={isRepeating}
                  centerWidth
                  onClick={() => onRepeat?.(order)}
                >
                  {isRepeating ? "Добавляем..." : "Повторить заказ"}
                </TextButton>

                <p className="order-details-page__repeat-note">
                  Резерв товаров сбросится через 5 минут
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
