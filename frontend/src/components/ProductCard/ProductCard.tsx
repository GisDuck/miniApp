import "./ProductCard.css";

import PlusIcon from "../../assets/icons/plus.svg?react";
import CheckmarkIcon from "../../assets/icons/checkmark.svg?react";

type ProductCardProduct = {
  id: number;
  title: string;
  price: number;
  imageUrl: string;
};

type ProductCardProps = {
  product: ProductCardProduct;
  isAdded: boolean;
  isAdding: boolean;
  onOpen: (productId: number) => void;
  onAddToCart: (productId: number) => void;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

export function ProductCard({
  product,
  isAdded,
  isAdding,
  onOpen,
  onAddToCart,
}: ProductCardProps) {
  return (
    <article className="product-card" onClick={() => onOpen(product.id)}>
      <div className="product-card__image-wrap">
        <img
          className="product-card__image"
          src={product.imageUrl}
          alt={product.title}
          loading="lazy"
        />
      </div>

      <div className="product-card__body">
        <h2 className="product-card__title">{product.title}</h2>

        <div className="product-card__footer">
          <strong className="product-card__price">
            {formatPrice(product.price)}
          </strong>

          <button
            className={
              [
                "product-card__add",
                isAdded ? "product-card__add--added" : "",
                isAdding ? "product-card__add--loading" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            type="button"
            aria-label={isAdded ? "Товар добавлен" : "Добавить в корзину"}
            disabled={isAdding}
            onClick={(event) => {
              event.stopPropagation();
              onAddToCart(product.id);
            }}
          >
            {isAdded ? (
              <CheckmarkIcon
                className="product-card__add-icon"
                aria-hidden="true"
                focusable="false"
              />
            ) : (
              <PlusIcon
                className="product-card__add-icon"
                aria-hidden="true"
                focusable="false"
              />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}