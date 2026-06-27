import { type UIEvent, useEffect, useRef, useState } from "react";

import ArrowIcon from "../../assets/icons/arrow.svg?react";
import FavoriteIcon from "../../assets/icons/favorite.svg?react";
import NotFavoriteIcon from "../../assets/icons/notFavorite.svg?react";
import { FloatingActionBar } from "../../components/FloatingActionBar/FloatingActionBar";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import { isDesktopOrTablet, isTelegramDesktop } from "../../shared/telegram";
import type { CatalogProduct, CatalogProductVariant } from "../../types/product";
import "./ProductDetailsPage.css";

type Product = CatalogProduct;

type AddToCartResponse = {
  id: number;
  productVariantId: string;
  quantity: number;
  cartCount?: number;
};

type CartResponse = {
  totalQuantity: number;
};

type FavoriteResponse = {
  productId: string;
  isFavorite: boolean;
};

type ProductDetailsPageProps = {
  product: Product;
  initialVariantId?: string | null;
  onCartCountChange: (cartCount: number) => void;
  onProductFavoriteChange: (productId: string, isFavorite: boolean) => void;
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
  initialVariantId = null,
  onCartCountChange,
  onProductFavoriteChange,
}: ProductDetailsPageProps) {
  const initialSelectedVariantId =
    product.variants.find(
      (variant) => variant.productVariantId === initialVariantId,
    )?.productVariantId ?? product.mainVariant.productVariantId;

  const [selectedVariantId, setSelectedVariantId] = useState(
    initialSelectedVariantId,
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [addedProductIds, setAddedProductIds] = useState<string[]>([]);
  const [addingProductIds, setAddingProductIds] = useState<string[]>([]);
  const [isFavoriteUpdating, setIsFavoriteUpdating] = useState(false);
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
  const shouldShowDesktopArrows =
    isTelegramDesktop() && selectedImages.length > 1;
  const pageClassName = isDesktopOrTablet()
    ? "product-details-page product-details-page--desktop-or-tablet"
    : "product-details-page";

  useEffect(() => {
    setSelectedVariantId(initialSelectedVariantId);
    setSelectedImageIndex(0);
  }, [product.productId, initialSelectedVariantId]);

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

  async function handleAddToCart(productVariantId: string) {
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

      window.setTimeout(() => {
        setAddedProductIds((currentIds) =>
          currentIds.filter((id) => id !== productVariantId),
        );
      }, 2000);

      if (typeof cartData.cartCount === "number") {
        onCartCountChange(cartData.cartCount);
      } else {
        await loadCartCount();
      }
    } catch (error) {
      setCartError(
        error instanceof Error
          ? error.message
          : "Не получилось добавить товар в корзину",
      );
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

  function handleSelectVariant(productVariantId: string) {
    setSelectedVariantId(productVariantId);
    setSelectedImageIndex(0);
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

  function handleGalleryArrowClick(direction: -1 | 1) {
    const nextIndex = Math.min(
      Math.max(selectedImageIndex + direction, 0),
      selectedImages.length - 1,
    );

    if (nextIndex === selectedImageIndex) {
      return;
    }

    galleryRef.current?.scrollTo({
      left: galleryRef.current.clientWidth * nextIndex,
      behavior: "smooth",
    });
    setSelectedImageIndex(nextIndex);
  }

  return (
    <section className={pageClassName}>
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
                alt={product.title}
                draggable="false"
              />
            ))
          ) : (
            <div className="product-details__image product-details__image--empty">
              Фото
            </div>
          )}
        </div>

        {shouldShowDesktopArrows && (
          <>
            <button
              className="product-details__gallery-arrow product-details__gallery-arrow--prev"
              type="button"
              aria-label="Предыдущая картинка"
              disabled={selectedImageIndex === 0}
              onClick={() => handleGalleryArrowClick(-1)}
            >
              <ArrowIcon
                className="product-details__gallery-arrow-icon"
                aria-hidden="true"
                focusable="false"
              />
            </button>

            <button
              className="product-details__gallery-arrow product-details__gallery-arrow--next"
              type="button"
              aria-label="Следующая картинка"
              disabled={selectedImageIndex === selectedImages.length - 1}
              onClick={() => handleGalleryArrowClick(1)}
            >
              <ArrowIcon
                className="product-details__gallery-arrow-icon"
                aria-hidden="true"
                focusable="false"
              />
            </button>
          </>
        )}

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

        <h1 className="product-details__title">{product.title}</h1>

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
                      isSelectedVariant
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
                  onClick={() => {
                    handleSelectVariant(variant.productVariantId);
                  }}
                >
                  <span>{variant.optionLabel}</span>
                  {!isAvailableVariant && (
                    <span className="product-details__variant-note">
                      нет в наличии
                    </span>
                  )}
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

      <FloatingActionBar
        price={formatPrice(selectedVariant.price)}
        actionText={isSelectedProductAdded ? "Добавлено" : "В корзину"}
        isActionDisabled={isSelectedProductAdding}
        isActionLoading={isSelectedProductAdding}
        statusText={
          isSelectedVariantAvailable ? undefined : "товар закончился"
        }
        onActionClick={() => handleAddToCart(selectedVariant.productVariantId)}
      />
    </section>
  );
}
