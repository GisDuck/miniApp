import "./CancelOrderConfirmModal.css";

type CancelOrderConfirmModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelOrderConfirmModal({
  onConfirm,
  onClose,
}: CancelOrderConfirmModalProps) {
  return (
    <div className="cancel-order-confirm">
      <button
        className="cancel-order-confirm__backdrop"
        type="button"
        aria-label="Закрыть подтверждение отмены"
        onClick={onClose}
      />

      <div className="cancel-order-confirm__panel" role="dialog" aria-modal="true">
        <h2 className="cancel-order-confirm__title">
          Вы уверены, что хотите отменить заказ?
        </h2>

        <div className="cancel-order-confirm__actions">
          <button
            className="cancel-order-confirm__button cancel-order-confirm__button--yes"
            type="button"
            onClick={onConfirm}
          >
            Да
          </button>

          <button
            className="cancel-order-confirm__button cancel-order-confirm__button--no"
            type="button"
            onClick={onClose}
          >
            Нет
          </button>
        </div>
      </div>
    </div>
  );
}
