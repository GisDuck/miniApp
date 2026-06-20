import { type MouseEvent, type UIEvent, useEffect, useRef, useState } from "react";

import CloseIcon from "../../assets/icons/close.svg?react";
import FavoriteIcon from "../../assets/icons/favorite.svg?react";
import NotFavoriteIcon from "../../assets/icons/notFavorite.svg?react";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import type { CatalogProduct, CatalogProductVariant } from "../../types/product";
import "./ProductDetailsPage.css";

type Product = CatalogProduct;

type AddToCartResponse = {
  id: number;
  productVariantId: number;
  quantity: number;
  cartCount?: number;
};

type CartResponse = {
  totalQuantity: number;
};

type FavoriteResponse = {
  productId: number;
  isFavorite: boolean;
};

type StockToast = {
  id: number;
  x: number;
  y: number;
};

type ProductDetailsPageProps = {
  product: Product;
  onBack: () => void;
  onCartCountChange: (cartCount: number) => void;
  onProductFavoriteChange: (productId: number, isFavorite: boolean) => void;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function getVariantImages(variant: CatalogProductVariant) {
  const images = variant.images.filter(Boolean);

  if (images.length > 0) {
    return images;
  }

  return variant.imageUrl ? [variant.imageUrl] : [];
}

function isVariantAvailable(variant: CatalogProductVariant) {
  return variant.isActive && variant.maxQuantity > 0;
}

export function ProductDetailsPage({
  product,
  onBack,
  onCartCountChange,
  onProductFavoriteChange,
}: ProductDetailsPageProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.mainVariant.productVariantId,
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [addedProductIds, setAddedProductIds] = useState<number[]>([]);
  const [addingProductIds, setAddingProductIds] = useState<number[]>([]);
  const [isFavoriteUpdating, setIsFavoriteUpdating] = useState(false);
  const [stockToast, setStockToast] = useState<StockToast | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const selectedVariant =
    product.variants.find(
      (variant) => variant.productVariantId === selectedVariantId,
    ) ?? product.mainVariant;
  const selectedImages = getVariantImages(selectedVariant);
  const isSelectedVariantAvailable =
    product.isActive && isVariantAvailable(selectedVariant);
  const isSelectedProductAdding = addingProductIds.includes(
    selectedVariant.productVariantId,
  );
  const isSelectedProductAdded = addedProductIds.includes(
    selectedVariant.productVariantId,
  );

  useEffect(() => {
    setSelectedVariantId(product.mainVariant.productVariantId);
    setSelectedImageIndex(0);
  }, [product.productId, product.mainVariant.productVariantId]);

  useEffect(() => {
    if (!stockToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStockToast(null);
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [stockToast]);

  useEffect(() => {
    if (selectedImages.length > 0 && selectedImageIndex >= selectedImages.length) {
      setSelectedImageIndex(0);
    }
  }, [selectedImages.length, selectedImageIndex]);

  useEffect(() => {
    galleryRef.current?.scrollTo({
      left: 0,
      behavior: "auto",
    });
  }, [selectedVariantId]);

  async function loadCartCount() {
    const response = await apiTGInitFetch("/cart");

    if (!response.ok) {
      throw new Error("Не получилось загрузить корзину");
    }

    const cart = (await response.json()) as CartResponse;
    onCartCountChange(cart.totalQuantity);
  }

  async function handleAddToCart(productVariantId: number) {
    if (addingProductIds.includes(productVariantId)) {
      return;
    }

    setCartError(null);
    setAddingProductIds((currentIds) => [...currentIds, productVariantId]);

    try {
      const response = await apiTGInitFetch("/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productVariantId,
          quantity: 1,
        }),
      });

      if (!response.ok) {
        throw new Error("Не получилось добавить товар в корзину");
      }

      const cartData = (await response.json()) as AddToCartResponse;

      setAddedProductIds((currentIds) => {
        if (currentIds.includes(productVariantId)) {
          return currentIds;
        }

        return [...currentIds, productVariantId];
      });

      if (typeof cartData.cartCount === "number") {
        onCartCountChange(cartData.cartCount);
      } else {
        await loadCartCount();
      }
    } catch {
      setCartError("Не получилось добавить товар в корзину");
    } finally {
      setAddingProductIds((currentIds) =>
        currentIds.filter((id) => id !== productVariantId),
      );
    }
  }

  async function handleFavoriteToggle() {
    if (isFavoriteUpdating) {
      return;
    }

    setFavoriteError(null);
    setIsFavoriteUpdating(true);

    try {
      const response = await apiTGInitFetch(`/favorites/${product.productId}`, {
        method: product.isFavorite ? "DELETE" : "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | Partial<FavoriteResponse>
        | null;

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "message" in data
            ? String(data.message)
            : "Не получилось обновить избранное";

        throw new Error(message);
      }

      onProductFavoriteChange(
        product.productId,
        typeof data?.isFavorite === "boolean"
          ? data.isFavorite
          : !product.isFavorite,
      );
    } catch (error) {
      setFavoriteError(
        error instanceof Error
          ? error.message
          : "Не получилось обновить избранное",
      );
    } finally {
      setIsFavoriteUpdating(false);
    }
  }

  function handleSelectVariant(productVariantId: number) {
    setSelectedVariantId(productVariantId);
    setSelectedImageIndex(0);
  }

  function showOutOfStockToast(event: MouseEvent<HTMLButtonElement>) {
    const horizontalMargin = 112;

    setStockToast({
      id: Date.now(),
      x: Math.min(
        Math.max(event.clientX, horizontalMargin),
        window.innerWidth - horizontalMargin,
      ),
      y: Math.min(Math.max(event.clientY, 48), window.innerHeight - 48),
    });
  }

  function handleImageScroll(event: UIEvent<HTMLDivElement>) {
    const gallery = event.currentTarget;

    if (gallery.clientWidth === 0 || selectedImages.length <= 1) {
      return;
    }

    const nextIndex = Math.round(gallery.scrollLeft / gallery.clientWidth);
    const normalizedIndex = Math.min(
      Math.max(nextIndex, 0),
      selectedImages.length - 1,
    );

    setSelectedImageIndex((currentIndex) =>
      currentIndex === normalizedIndex ? currentIndex : normalizedIndex,
    );
  }

  return (
    <section className="product-details-page">
      {stockToast && (
        <div
          key={stockToast.id}
          className="product-details__stock-toast"
          style={{
            left: stockToast.x,
            top: stockToast.y,
          }}
        >
          Товар закончился
        </div>
      )}

      <button
        className="product-details__close"
        type="button"
        onClick={onBack}
        aria-label="Закрыть"
      >
        <CloseIcon
          className="product-details__close-icon"
          aria-hidden="true"
          focusable="false"
        />
      </button>

      <div className="product-details__media">
        <div
          className="product-details__gallery"
          ref={galleryRef}
          onScroll={handleImageScroll}
        >
          {selectedImages.length > 0 ? (
            selectedImages.map((imageUrl, imageIndex) => (
              <img
                key={`${imageUrl}-${imageIndex}`}
                className="product-details__image"
                src={imageUrl}
                alt={selectedVariant.title}
                draggable="false"
              />
            ))
          ) : (
            <div className="product-details__image product-details__image--empty">
              Фото
            </div>
          )}
        </div>

        {selectedImages.length > 1 && (
          <div className="product-details__image-dots" aria-hidden="true">
            {selectedImages.map((imageUrl, imageIndex) => (
              <span
                key={`${imageUrl}-${imageIndex}`}
                className={
                  imageIndex === selectedImageIndex
                    ? "product-details__image-dot product-details__image-dot--active"
                    : "product-details__image-dot"
                }
              />
            ))}
          </div>
        )}

        <button
          className={
            [
              "product-details__favorite",
              product.isFavorite ? "product-details__favorite--active" : "",
              isFavoriteUpdating ? "product-details__favorite--loading" : "",
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
          onClick={handleFavoriteToggle}
        >
          {isFavoriteUpdating ? (
            <span
              className="product-details__favorite-spinner"
              aria-hidden="true"
            />
          ) : product.isFavorite ? (
            <FavoriteIcon
              className="product-details__favorite-icon"
              aria-hidden="true"
              focusable="false"
            />
          ) : (
            <NotFavoriteIcon
              className="product-details__favorite-icon"
              aria-hidden="true"
              focusable="false"
            />
          )}
        </button>
      </div>

      <div className="product-details__body">
        <p className="product-details__category">{product.categoryTitle}</p>

        <h1 className="product-details__title">{selectedVariant.title}</h1>

        {product.variants.length > 1 && (
          <div
            className="product-details__variants"
            aria-label="Варианты комплектации"
          >
            {product.variants.map((variant) => {
              const isAvailableVariant = isVariantAvailable(variant);
              const isSelectedVariant =
                variant.productVariantId === selectedVariant.productVariantId;

              return (
                <button
                  key={variant.productVariantId}
                  className={
                    [
                      "product-details__variant",
                      isSelectedVariant && isAvailableVariant
                        ? "product-details__variant--active"
                        : "",
                      !isAvailableVariant
                        ? "product-details__variant--unavailable"
                        : "",
                    ]
                    .filter(Boolean)
                    .join(" ")
                  }
                  type="button"
                  aria-disabled={!isAvailableVariant}
                  onClick={(event) => {
                    if (!isAvailableVariant) {
                      showOutOfStockToast(event);
                      return;
                    }

                    handleSelectVariant(variant.productVariantId);
                  }}
                >
                  {variant.optionLabel}
                </button>
              );
            })}
          </div>
        )}

        <p className="product-details__description">
          {selectedVariant.description ??
            product.description ??
            selectedVariant.optionLabel}
        </p>

        {cartError && (
          <p className="product-details__status product-details__status--error">
            {cartError}
          </p>
        )}

        {favoriteError && (
          <p className="product-details__status product-details__status--error">
            {favoriteError}
          </p>
        )}
      </div>

      <footer className="product-details__footer">
        <strong className="product-details__price">
          {formatPrice(selectedVariant.price)}
        </strong>

        {isSelectedVariantAvailable && (
          <button
            className="product-details__button"
            type="button"
            disabled={isSelectedProductAdding}
            onClick={() => handleAddToCart(selectedVariant.productVariantId)}
          >
            {isSelectedProductAdding ? (
              <span
                className="product-details__button-spinner"
                aria-hidden="true"
              />
            ) : isSelectedProductAdded ? (
              "Добавлено"
            ) : (
              "В корзину"
            )}
          </button>
        )}
      </footer>
    </section>
  );
}
