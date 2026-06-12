import "./CartItemCard.css";

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
            onClick={() =>
              onQuantityChange(item.productId, item.quantity - 1)
            }
          >
            <span
              className="cart-item-card__quantity-icon cart-item-card__quantity-icon--minus"
              aria-hidden="true"
            >
              −
            </span>
          </button>

          <span className="cart-item-card__quantity">{item.quantity}</span>

          <button
            className="cart-item-card__quantity-button cart-item-card__quantity-button--plus"
            type="button"
            aria-label="Увеличить количество"
            disabled={isUpdating}
            onClick={() =>
              onQuantityChange(item.productId, item.quantity + 1)
            }
          >
            <span
              className="cart-item-card__quantity-icon cart-item-card__quantity-icon--plus"
              aria-hidden="true"
            >
              +
            </span>
          </button>
        </div>
      </div>

      <strong className="cart-item-card__total">
        {formatPrice(item.totalPrice)}
      </strong>
    </article>
  );
}