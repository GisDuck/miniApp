import "./CartItemCard.css";

import DeleteIcon from "../../assets/icons/delete.svg?react";
import MinusIcon from "../../assets/icons/minus.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";

export type CartStockStatus = "AVAILABLE" | "LIMITED" | "OUT_OF_STOCK";

export type CartItemCardData = {
  id: number;
  productId: number;
  productVariantId: number;
  title: string;
  optionLabel: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  availableQuantity: number;
  lineTotal: number;
  stockStatus: CartStockStatus;
};

type CartItemCardProps = {
  item: CartItemCardData;
  isUpdating: boolean;
  onQuantityChange: (productVariantId: number, nextQuantity: number) => void;
  onDeleteRequest: (item: CartItemCardData) => void;
  onProductOpen: (productId: number, productVariantId?: number | null) => void;
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
  onDeleteRequest,
  onProductOpen,
}: CartItemCardProps) {
  return (
    <article
      className={
        item.stockStatus !== "OUT_OF_STOCK"
          ? "cart-item-card"
          : "cart-item-card cart-item-card--unavailable"
      }
    >
      <button
        className="cart-item-card__image-button"
        type="button"
        aria-label="Открыть товар"
        onClick={() => onProductOpen(item.productId, item.productVariantId)}
      >
        {item.imageUrl ? (
          <img
            className="cart-item-card__image"
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
          />
        ) : (
          <span className="cart-item-card__image cart-item-card__image--empty">
            Фото
          </span>
        )}
      </button>

      <div className="cart-item-card__content">
        <h2 className="cart-item-card__title">{item.title}</h2>

        {item.stockStatus === "LIMITED" && (
          <p className="cart-item-card__status">
            Доступное кол-во: {item.availableQuantity}
          </p>
        )}

        {item.stockStatus === "OUT_OF_STOCK" && (
          <p className="cart-item-card__status">Товар закончился</p>
        )}

        <div className="cart-item-card__actions">
          <button
            className="cart-item-card__delete-button"
            type="button"
            aria-label="Удалить товар из корзины"
            disabled={isUpdating}
            onClick={() => onDeleteRequest(item)}
          >
            <DeleteIcon
              className="cart-item-card__delete-icon"
              aria-hidden="true"
              focusable="false"
            />
          </button>

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
              disabled={
                isUpdating ||
                item.stockStatus === "OUT_OF_STOCK" ||
                item.quantity >= item.availableQuantity
              }
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
      </div>

      <strong className="cart-item-card__total">
        {formatPrice(item.lineTotal)}
      </strong>
    </article>
  );
}
