import "./CartItemCard.css";

import MinusIcon from "../../assets/icons/minus.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";

export type CartItemCardProduct = {
  id: number;
  title: string;
  price: number;
  imageUrl: string;
  description: string;
  category: string;
};

export type CartItemCardData = {
  id: number;
  productId: number;
  quantity: number;
  product: CartItemCardProduct;
  totalPrice: number;
};

type CartItemCardProps = {
  item: CartItemCardData;
  isUpdating: boolean;
  onQuantityChange: (productId: number, nextQuantity: number) => void;
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
      <img
        className="cart-item-card__image"
        src={item.product.imageUrl}
        alt={item.product.title}
        loading="lazy"
      />

      <div className="cart-item-card__content">
        <h2 className="cart-item-card__title">{item.product.title}</h2>

        <div className="cart-item-card__controls" aria-label="Количество">
          <button
            className="cart-item-card__quantity-button"
            type="button"
            aria-label="Уменьшить количество"
            disabled={isUpdating}
            onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
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
            disabled={isUpdating}
            onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
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
        {formatPrice(item.totalPrice)}
      </strong>
    </article>
  );
}