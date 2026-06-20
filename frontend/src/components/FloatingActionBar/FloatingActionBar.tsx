import "./FloatingActionBar.css";

type FloatingActionBarProps = {
  price: string;
  priceLabel?: string;
  actionText?: string;
  actionAriaLabel?: string;
  isActionDisabled?: boolean;
  isActionLoading?: boolean;
  statusText?: string;
  onActionClick?: () => void;
};

export function FloatingActionBar({
  price,
  priceLabel,
  actionText,
  actionAriaLabel,
  isActionDisabled = false,
  isActionLoading = false,
  statusText,
  onActionClick,
}: FloatingActionBarProps) {
  return (
    <footer className="floating-action-bar">
      <div className="floating-action-bar__price-box">
        {priceLabel && (
          <span className="floating-action-bar__label">{priceLabel}</span>
        )}

        <strong className="floating-action-bar__price">{price}</strong>
      </div>

      {statusText ? (
        <span className="floating-action-bar__status">{statusText}</span>
      ) : (
        <button
          className="floating-action-bar__button"
          type="button"
          aria-label={actionAriaLabel ?? actionText}
          disabled={isActionDisabled || isActionLoading}
          onClick={onActionClick}
        >
          {isActionLoading ? (
            <span
              className="floating-action-bar__button-spinner"
              aria-hidden="true"
            />
          ) : (
            actionText
          )}
        </button>
      )}
    </footer>
  );
}
