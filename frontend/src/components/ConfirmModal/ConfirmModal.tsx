import type { CSSProperties, ReactNode } from "react";

import { TextButton } from "../TextButton/TextButton";
import "./ConfirmModal.css";

export type ConfirmModalAction = {
  label: ReactNode;
  onClick: () => void;
  textColor?: string;
  borderColor?: string;
  fillColor?: string;
  fontSize?: string;
  disabled?: boolean;
};

type ConfirmModalProps = {
  message: ReactNode;
  actions: ConfirmModalAction[];
  onClose?: () => void;
  closeLabel?: string;
};

export function ConfirmModal({
  message,
  actions,
  onClose,
  closeLabel = "Закрыть окно подтверждения",
}: ConfirmModalProps) {
  const actionsStyle = {
    "--confirm-modal-action-count": actions.length,
  } as CSSProperties & { "--confirm-modal-action-count": number };

  return (
    <div className="confirm-modal">
      {onClose && (
        <button
          className="confirm-modal__backdrop"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
        />
      )}

      <div className="confirm-modal__panel" role="dialog" aria-modal="true">
        <p className="confirm-modal__text">{message}</p>

        <div
          className="confirm-modal__actions"
          style={actionsStyle}
        >
          {actions.map((action, index) => (
            <TextButton
              className="confirm-modal__button"
              type="button"
              key={index}
              textColor={action.textColor}
              borderColor={action.borderColor}
              fillColor={action.fillColor}
              fontSize={action.fontSize}
              disabled={action.disabled}
              fullWidth
              onClick={action.onClick}
            >
              {action.label}
            </TextButton>
          ))}
        </div>
      </div>
    </div>
  );
}
