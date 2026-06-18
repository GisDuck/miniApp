import "./CartItemCard.css";

import MinusIcon from "../../assets/icons/minus.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";

export type CartItemCardData = {
  id: number;
  productVariantId: number;
  title: string;
  optionLabel: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  maxQuantity: number;
  lineTotal: number;
};

type CartItemCardProps = {
  item: CartItemCardData;
  isUpdating: boolean;
  onQuantityChange: (productVariantId: number, nextQuantity: number) => void;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

export function CartItemCard({
  item,
  isUpdating,
  onQuantityChange,
}: CartItemCardProps) {
  return (
    <article className="cart-item-card">
      {item.imageUrl ? (
        <img
          className="cart-item-card__image"
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
        />
      ) : (
        <div className="cart-item-card__image cart-item-card__image--empty">
          Фото
        </div>
      )}

      <div className="cart-item-card__content">
        <h2 className="cart-item-card__title">{item.title}</h2>

        <div className="cart-item-card__controls" aria-label="Количество">
          <button
            className="cart-item-card__quantity-button"
            type="button"
            aria-label="Уменьшить количество"
            disabled={isUpdating}
            onClick={() =>
              onQuantityChange(item.productVariantId, item.quantity - 1)
            }
          >
            <MinusIcon
              className="cart-item-card__quantity-icon"
              aria-hidden="true"
              focusable="false"
            />
          </button>

          <span className="cart-item-card__quantity">{item.quantity}</span>

          <button
            className="cart-item-card__quantity-button cart-item-card__quantity-button--plus"
            type="button"
            aria-label="Увеличить количество"
            disabled={isUpdating || item.quantity >= item.maxQuantity}
            onClick={() =>
              onQuantityChange(item.productVariantId, item.quantity + 1)
            }
          >
            <PlusIcon
              className="cart-item-card__quantity-icon"
              aria-hidden="true"
              focusable="false"
            />
          </button>
        </div>
      </div>

      <strong className="cart-item-card__total">
        {formatPrice(item.lineTotal)}
      </strong>
    </article>
  );
}
