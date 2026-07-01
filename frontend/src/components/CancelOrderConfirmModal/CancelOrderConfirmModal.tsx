import { TextButton } from "../TextButton/TextButton";
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
          <TextButton
            className="cancel-order-confirm__button cancel-order-confirm__button--yes"
            type="button"
            textColor="#ff3b3b"
            borderColor="#ff3b3b"
            fillColor="transparent"
            fullWidth
            onClick={onConfirm}
          >
            Да
          </TextButton>

          <TextButton
            className="cancel-order-confirm__button cancel-order-confirm__button--no"
            type="button"
            borderColor="var(--color-accent)"
            fillColor="var(--color-accent)"
            textColor="var(--color-btn-text)"
            fullWidth
            onClick={onClose}
          >
            Нет
          </TextButton>
        </div>
      </div>
    </div>
  );
}
