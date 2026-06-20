import "./ProductCard.css";

import CartIcon from "../../assets/icons/cart.svg?react";
import CheckmarkIcon from "../../assets/icons/checkmark.svg?react";
import FavoriteIcon from "../../assets/icons/favorite.svg?react";
import NotFavoriteIcon from "../../assets/icons/notFavorite.svg?react";
import type { CatalogProduct } from "../../types/product";

type ProductCardProps = {
  product: CatalogProduct;
  isAdded: boolean;
  isAdding: boolean;
  isFavoriteUpdating: boolean;
  hideAddButton?: boolean;
  onOpen: (productId: number) => void;
  onAddToCart: (productVariantId: number) => void;
  onFavoriteToggle: (productId: number) => void;
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
  isFavoriteUpdating,
  hideAddButton = false,
  onOpen,
  onAddToCart,
  onFavoriteToggle,
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

        <button
          className={
            [
              "product-card__favorite",
              product.isFavorite ? "product-card__favorite--active" : "",
              isFavoriteUpdating ? "product-card__favorite--loading" : "",
            ]
              .filter(Boolean)
              .join(" ")
          }
          type="button"
          aria-label={
            product.isFavorite
              ? "Убрать из избранного"
              : "Добавить в избранное"
          }
          disabled={isFavoriteUpdating}
          onClick={(event) => {
            event.stopPropagation();
            onFavoriteToggle(product.productId);
          }}
        >
          {isFavoriteUpdating ? (
            <span className="product-card__favorite-spinner" aria-hidden="true" />
          ) : product.isFavorite ? (
            <FavoriteIcon
              className="product-card__favorite-icon"
              aria-hidden="true"
              focusable="false"
            />
          ) : (
            <NotFavoriteIcon
              className="product-card__favorite-icon"
              aria-hidden="true"
              focusable="false"
            />
          )}
        </button>
      </div>

      <div className="product-card__body">
        <h2 className="product-card__title">{mainVariant.title}</h2>

        <div className="product-card__footer">
          <strong className="product-card__price">
            {formatPrice(mainVariant.price)}
          </strong>

          {!hideAddButton && (
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
            {isAdding ? (
              <span className="product-card__add-spinner" aria-hidden="true" />
            ) : isAdded ? (
              <CheckmarkIcon
                className="product-card__add-icon"
                aria-hidden="true"
                focusable="false"
              />
            ) : (
              <CartIcon
                className="product-card__add-icon"
                aria-hidden="true"
                focusable="false"
              />
            )}
          </button>
          )}
        </div>
      </div>
    </article>
  );
}
