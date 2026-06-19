import "./ProductCard.css";

import PlusIcon from "../../assets/icons/plus.svg?react";
import CheckmarkIcon from "../../assets/icons/checkmark.svg?react";
import type { CatalogProduct } from "../../types/product";

type ProductCardProps = {
  product: CatalogProduct;
  isAdded: boolean;
  isAdding: boolean;
  onOpen: (productId: number) => void;
  onAddToCart: (productVariantId: number) => void;
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
  const mainVariant = product.mainVariant;

  return (
    <article
      className="product-card"
      onClick={() => onOpen(product.productId)}
    >
      <div className="product-card__image-wrap">
        {mainVariant.imageUrl ? (
          <img
            className="product-card__image"
            src={mainVariant.imageUrl}
            alt={mainVariant.title}
            loading="lazy"
          />
        ) : (
          <div className="product-card__image-placeholder">Фото</div>
        )}
      </div>

      <div className="product-card__body">
        <h2 className="product-card__title">{mainVariant.title}</h2>

        <div className="product-card__footer">
          <strong className="product-card__price">
            {formatPrice(mainVariant.price)}
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
              onAddToCart(mainVariant.productVariantId);
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
