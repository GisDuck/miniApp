import { type UIEvent, useEffect, useRef, useState } from "react";

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
  onOpen: (productId: string, productVariantId?: string | null) => void;
  onAddToCart: (productVariantId: string) => void;
  onFavoriteToggle: (productId: string) => void;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function getVariantImages(variant: CatalogProduct["mainVariant"]) {
  const images = variant.images.filter(Boolean);

  if (images.length > 0) {
    return images;
  }

  return variant.imageUrl ? [variant.imageUrl] : [];
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
  const images = getVariantImages(mainVariant);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const dotsTimeoutRef = useRef<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [areImageDotsVisible, setAreImageDotsVisible] = useState(false);

  useEffect(() => {
    galleryRef.current?.scrollTo({
      left: 0,
      behavior: "auto",
    });
    setActiveImageIndex(0);
    setAreImageDotsVisible(false);
  }, [mainVariant.productVariantId]);

  useEffect(() => {
    return () => {
      if (dotsTimeoutRef.current !== null) {
        window.clearTimeout(dotsTimeoutRef.current);
      }
    };
  }, []);

  function showImageDotsTemporarily() {
    setAreImageDotsVisible(true);

    if (dotsTimeoutRef.current !== null) {
      window.clearTimeout(dotsTimeoutRef.current);
    }

    dotsTimeoutRef.current = window.setTimeout(() => {
      setAreImageDotsVisible(false);
      dotsTimeoutRef.current = null;
    }, 1600);
  }

  function handleImageScroll(event: UIEvent<HTMLDivElement>) {
    const gallery = event.currentTarget;

    if (gallery.clientWidth === 0 || images.length <= 1) {
      return;
    }

    showImageDotsTemporarily();

    const nextIndex = Math.round(gallery.scrollLeft / gallery.clientWidth);
    const normalizedIndex = Math.min(Math.max(nextIndex, 0), images.length - 1);

    setActiveImageIndex((currentIndex) =>
      currentIndex === normalizedIndex ? currentIndex : normalizedIndex,
    );
  }

  return (
    <article
      className="product-card"
      onClick={() => onOpen(product.productId, mainVariant.productVariantId)}
    >
      <div className="product-card__image-wrap">
        <div
          ref={galleryRef}
          className="product-card__gallery"
          onScroll={handleImageScroll}
        >
        {images.length > 0 ? (
          images.map((imageUrl, imageIndex) => (
            <img
              key={`${imageUrl}-${imageIndex}`}
              className="product-card__image"
              src={imageUrl}
              alt={mainVariant.title}
              loading="lazy"
              draggable="false"
            />
          ))
        ) : (
          <div className="product-card__image-placeholder">Фото</div>
        )}

        </div>

        {images.length > 1 && (
          <div
            className={
              areImageDotsVisible
                ? "product-card__image-dots product-card__image-dots--visible"
                : "product-card__image-dots"
            }
            aria-hidden="true"
          >
            {images.map((imageUrl, imageIndex) => (
              <span
                key={`${imageUrl}-${imageIndex}`}
                className={
                  imageIndex === activeImageIndex
                    ? "product-card__image-dot product-card__image-dot--active"
                    : "product-card__image-dot"
                }
              />
            ))}
          </div>
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
