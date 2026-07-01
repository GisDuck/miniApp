import { ConfirmModal } from "../ConfirmModal/ConfirmModal";

type CancelOrderConfirmModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelOrderConfirmModal({
  onConfirm,
  onClose,
}: CancelOrderConfirmModalProps) {
  return (
    <ConfirmModal
      message="Вы уверены, что хотите отменить заказ?"
      closeLabel="Закрыть подтверждение отмены"
      onClose={onClose}
      actions={[
        {
          label: "Да",
          onClick: onConfirm,
          textColor: "var(--color-status-danger)",
          borderColor: "var(--color-status-danger)",
        },
        {
          label: "Нет",
          onClick: onClose,
          textColor: "var(--color-btn-text)",
          borderColor: "var(--color-accent)",
          fillColor: "var(--color-accent)",
        },
      ]}
    />
  );
}
