import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

import { ProductCard } from "../../components/ProductCard/ProductCard";
import "./CatalogPage.css";
import CloseIcon from "../../assets/icons/close.svg?react";
import SearchIcon from "../../assets/icons/search.svg?react";
import FavoriteIcon from "../../assets/icons/favorite.svg?react";
import NotFavoriteIcon from "../../assets/icons/notFavorite.svg?react";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import type { CatalogProduct, CatalogProductVariant } from "../../types/product";

export type Category = {
  id: number;
  title: string;
};

export type Product = CatalogProduct;

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

type CatalogPageProps = {
  categories: Category[];
  products: Product[];
  isCategoriesLoading: boolean;
  isProductsLoading: boolean;
  categoriesError: string | null;
  productsError: string | null;
  onCartCountChange: (cartCount: number) => void;
  onProductFavoriteChange: (productId: number, isFavorite: boolean) => void;
  title?: string;
  showCategories?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  loadingText?: string;
  emptyText?: string;
  emptySearchText?: (query: string) => string;
};

export const ALL_CATEGORY_TITLE = "Все";

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function CatalogPage({
  categories,
  products,
  isCategoriesLoading,
  isProductsLoading,
  categoriesError,
  productsError,
  onCartCountChange,
  onProductFavoriteChange,
  title = "Каталог",
  showCategories = true,
  searchPlaceholder = "Поиск по названию",
  searchAriaLabel = "Поиск по названию товара",
  loadingText = "Загрузка каталога...",
  emptyText = "В этой категории пока нет товаров.",
  emptySearchText = (query) => `По запросу «${query}» ничего не найдено.`,
}: CatalogPageProps) {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_TITLE);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null,
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageDragOffset, setImageDragOffset] = useState(0);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [addedProductIds, setAddedProductIds] = useState<number[]>([]);
  const [addingProductIds, setAddingProductIds] = useState<number[]>([]);
  const [favoriteUpdatingProductIds, setFavoriteUpdatingProductIds] = useState<
    number[]
  >([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);

  const [cartError, setCartError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = normalizeSearchText(trimmedSearchQuery);
  const isSearchActive = normalizedSearchQuery.length > 0;

  const visibleProducts = useMemo(() => {
    const productsByCategory =
      !showCategories || activeCategory === ALL_CATEGORY_TITLE
        ? products
        : products.filter((product) => product.categoryTitle === activeCategory);

    if (!normalizedSearchQuery) {
      return productsByCategory;
    }

    const searchableProducts = productsByCategory.map((product) => ({
      ...product,
      searchTitle: normalizeSearchText(product.mainVariant.title),
      searchCategory: normalizeSearchText(product.categoryTitle),
      searchDescription: normalizeSearchText(product.description),
    }));

    const fuse = new Fuse(searchableProducts, {
      keys: [
        { name: "searchTitle", weight: 0.7 },
        { name: "searchCategory", weight: 0.2 },
        { name: "searchDescription", weight: 0.1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      shouldSort: true,
      minMatchCharLength: 2,
    });

    return fuse.search(normalizedSearchQuery).map((result) => result.item);
  }, [activeCategory, products, normalizedSearchQuery, showCategories]);

  function handleSearchButtonClick() {
    setIsSearchOpen(true);
  }

  function handleCloseSearch() {
    setSearchQuery("");
    setIsSearchOpen(false);
  }

  function handleOpenProduct(productId: number) {
    const product = products.find(
      (item) => item.productId === productId,
    );

    if (!product) {
      return;
    }

    setSelectedProduct(product);
    setSelectedVariantId(product.mainVariant.productVariantId);
    setSelectedImageIndex(0);
    setImageDragOffset(0);
    setIsImageDragging(false);
  }

  function handleCloseProduct() {
    setSelectedProduct(null);
    setSelectedVariantId(null);
    setSelectedImageIndex(0);
    setImageDragOffset(0);
    setIsImageDragging(false);
    swipeStartXRef.current = null;
  }

  async function loadCartCount() {
    const response = await apiTGInitFetch("/cart");

    if (!response.ok) {
      throw new Error("Не удалось загрузить корзину");
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
        throw new Error("Не удалось добавить товар в корзину");
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

  function isProductAdded(productVariantId: number) {
    return addedProductIds.includes(productVariantId);
  }

  function isProductAdding(productVariantId: number) {
    return addingProductIds.includes(productVariantId);
  }

  async function handleFavoriteToggle(productId: number) {
    const product = products.find((item) => item.productId === productId);

    if (!product || favoriteUpdatingProductIds.includes(productId)) {
      return;
    }

    setFavoriteError(null);
    setFavoriteUpdatingProductIds((currentIds) => [...currentIds, productId]);

    try {
      const response = await apiTGInitFetch(`/favorites/${productId}`, {
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
        productId,
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
      setFavoriteUpdatingProductIds((currentIds) =>
        currentIds.filter((id) => id !== productId),
      );
    }
  }

  function isFavoriteUpdating(productId: number) {
    return favoriteUpdatingProductIds.includes(productId);
  }

  const isLoading =
    (showCategories && isCategoriesLoading) || isProductsLoading;
  const currentSelectedProduct =
    selectedProduct &&
    (products.find((product) => product.productId === selectedProduct.productId) ??
      selectedProduct);
  const selectedVariant: CatalogProductVariant | null =
    currentSelectedProduct?.variants.find(
      (variant) => variant.productVariantId === selectedVariantId,
    ) ??
    currentSelectedProduct?.mainVariant ??
    null;
  const selectedImages = selectedVariant ? getVariantImages(selectedVariant) : [];
  const isSelectedProductAdding = selectedVariant
    ? isProductAdding(selectedVariant.productVariantId)
    : false;

  useEffect(() => {
    if (selectedImages.length > 0 && selectedImageIndex >= selectedImages.length) {
      setSelectedImageIndex(0);
    }
  }, [selectedImages.length, selectedImageIndex]);

  function handleSelectVariant(productVariantId: number) {
    setSelectedVariantId(productVariantId);
    setSelectedImageIndex(0);
    setImageDragOffset(0);
    setIsImageDragging(false);
    swipeStartXRef.current = null;
  }

  function handleImagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (selectedImages.length <= 1) {
      return;
    }

    swipeStartXRef.current = event.clientX;
    setImageDragOffset(0);
    setIsImageDragging(true);
  }

  function handleImagePointerMove(event: PointerEvent<HTMLDivElement>) {
    const startX = swipeStartXRef.current;

    if (startX === null) {
      return;
    }

    setImageDragOffset(event.clientX - startX);
  }

  function handleImagePointerUp(event: PointerEvent<HTMLDivElement>) {
    const startX = swipeStartXRef.current;
    swipeStartXRef.current = null;
    setImageDragOffset(0);
    setIsImageDragging(false);

    if (startX === null || selectedImages.length <= 1) {
      return;
    }

    const deltaX = event.clientX - startX;

    if (Math.abs(deltaX) < 40) {
      return;
    }

    setSelectedImageIndex((currentIndex) => {
      if (deltaX < 0) {
        return (currentIndex + 1) % selectedImages.length;
      }

      return (currentIndex - 1 + selectedImages.length) % selectedImages.length;
    });
  }

  return (
    <section className="catalog-page">
      {isSearchOpen && (
        <form
          className="catalog-search"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            ref={searchInputRef}
            className="catalog-search__input"
            type="search"
            value={searchQuery}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                handleCloseSearch();
              }
            }}
          />

          <button
            className="catalog-search__close"
            type="button"
            aria-label="Закрыть поиск"
            onClick={handleCloseSearch}
          >
            <CloseIcon
              className="catalog-search__close-icon"
              aria-hidden="true"
              focusable="false"
            />
          </button>
        </form>
      )}

      <header className="catalog-header">
        <div>
          <h1 className="catalog-header__title">{title}</h1>
        </div>

        <button
          className="catalog-header__search"
          type="button"
          aria-label="Открыть поиск"
          aria-expanded={isSearchOpen}
          onClick={handleSearchButtonClick}
        >
          <SearchIcon
            className="catalog-header__search-icon"
            aria-hidden="true"
            focusable="false"
          />
        </button>
      </header>

      {showCategories && (
        <div className="catalog-categories" aria-label="Категории товаров">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                activeCategory === category.title
                  ? "catalog-categories__button catalog-categories__button--active"
                  : "catalog-categories__button"
              }
              onClick={() => setActiveCategory(category.title)}
            >
              {category.title}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="catalog-status">{loadingText}</p>}

      {showCategories && categoriesError && !isCategoriesLoading && (
        <p className="catalog-status catalog-status--error">
          {categoriesError}
        </p>
      )}

      {productsError && !isProductsLoading && (
        <p className="catalog-status catalog-status--error">{productsError}</p>
      )}

      {cartError && (
        <p className="catalog-status catalog-status--error">{cartError}</p>
      )}

      {favoriteError && (
        <p className="catalog-status catalog-status--error">{favoriteError}</p>
      )}

      {!productsError && !isProductsLoading && visibleProducts.length === 0 && (
        <p className="catalog-status">
          {isSearchActive
            ? emptySearchText(trimmedSearchQuery)
            : emptyText}
        </p>
      )}

      {!isProductsLoading && visibleProducts.length > 0 && (
        <div className="catalog-grid">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.productId}
              product={product}
              isAdded={isProductAdded(product.mainVariant.productVariantId)}
              isAdding={isProductAdding(product.mainVariant.productVariantId)}
              isFavoriteUpdating={isFavoriteUpdating(product.productId)}
              onOpen={handleOpenProduct}
              onAddToCart={handleAddToCart}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      )}

      {currentSelectedProduct && selectedVariant && (
        <div className="product-modal" role="dialog" aria-modal="true">
          <button
            className="product-modal__backdrop"
            type="button"
            aria-label="Закрыть"
            onClick={handleCloseProduct}
          />

          <div className="product-modal__panel">
            <button
              className="product-modal__close"
              type="button"
              onClick={handleCloseProduct}
              aria-label="Закрыть"
            >
              <CloseIcon
                className="product-modal__close-icon"
                aria-hidden="true"
                focusable="false"
              />
            </button>

            <div className="product-modal__media">
              <div
                className="product-modal__gallery"
                onPointerDown={handleImagePointerDown}
                onPointerMove={handleImagePointerMove}
                onPointerUp={handleImagePointerUp}
                onPointerCancel={() => {
                  swipeStartXRef.current = null;
                  setImageDragOffset(0);
                  setIsImageDragging(false);
                }}
                onPointerLeave={() => {
                  if (swipeStartXRef.current === null) {
                    return;
                  }

                  swipeStartXRef.current = null;
                  setImageDragOffset(0);
                  setIsImageDragging(false);
                }}
              >
                {selectedImages.length > 0 ? (
                  <div
                    className={
                      isImageDragging
                        ? "product-modal__gallery-track product-modal__gallery-track--dragging"
                        : "product-modal__gallery-track"
                    }
                    style={{
                      transform: `translate3d(calc(${
                        selectedImageIndex * -100
                      }% + ${imageDragOffset}px), 0, 0)`,
                    }}
                  >
                    {selectedImages.map((imageUrl, imageIndex) => (
                      <img
                        key={`${imageUrl}-${imageIndex}`}
                        className="product-modal__image"
                        src={imageUrl}
                        alt={selectedVariant.title}
                        draggable="false"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="product-modal__image product-modal__image--empty">
                    Фото
                  </div>
                )}
              </div>

              {selectedImages.length > 1 && (
                <div className="product-modal__image-dots" aria-hidden="true">
                  {selectedImages.map((imageUrl, imageIndex) => (
                    <span
                      key={`${imageUrl}-${imageIndex}`}
                      className={
                        imageIndex === selectedImageIndex
                          ? "product-modal__image-dot product-modal__image-dot--active"
                          : "product-modal__image-dot"
                      }
                    />
                  ))}
                </div>
              )}

              <button
                className={
                  [
                    "product-modal__favorite",
                    currentSelectedProduct.isFavorite
                      ? "product-modal__favorite--active"
                      : "",
                    isFavoriteUpdating(currentSelectedProduct.productId)
                      ? "product-modal__favorite--loading"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                type="button"
                aria-label={
                  currentSelectedProduct.isFavorite
                    ? "Убрать из избранного"
                    : "Добавить в избранное"
                }
                disabled={isFavoriteUpdating(currentSelectedProduct.productId)}
                onClick={() =>
                  handleFavoriteToggle(currentSelectedProduct.productId)
                }
              >
                {isFavoriteUpdating(currentSelectedProduct.productId) ? (
                  <span
                    className="product-modal__favorite-spinner"
                    aria-hidden="true"
                  />
                ) : currentSelectedProduct.isFavorite ? (
                  <FavoriteIcon
                    className="product-modal__favorite-icon"
                    aria-hidden="true"
                    focusable="false"
                  />
                ) : (
                  <NotFavoriteIcon
                    className="product-modal__favorite-icon"
                    aria-hidden="true"
                    focusable="false"
                  />
                )}
              </button>
            </div>

            <div className="product-modal__body">
              <p className="product-modal__category">
                {currentSelectedProduct.categoryTitle}
              </p>

              <h2 className="product-modal__title">
                {selectedVariant.title}
              </h2>

              {currentSelectedProduct.variants.length > 1 && (
                <div
                  className="product-modal__variants"
                  aria-label="Варианты комплектации"
                >
                  {currentSelectedProduct.variants.map((variant) => (
                    <button
                      key={variant.productVariantId}
                      className={
                        variant.productVariantId === selectedVariant.productVariantId
                          ? "product-modal__variant product-modal__variant--active"
                          : "product-modal__variant"
                      }
                      type="button"
                      onClick={() =>
                        handleSelectVariant(variant.productVariantId)
                      }
                    >
                      {variant.optionLabel}
                    </button>
                  ))}
                </div>
              )}

              <p className="product-modal__description">
                {selectedVariant.description ??
                  currentSelectedProduct.description ??
                  selectedVariant.optionLabel}
              </p>

              <div className="product-modal__footer">
                <strong className="product-modal__price">
                  {formatPrice(selectedVariant.price)}
                </strong>

                <button
                  className="product-modal__button"
                  type="button"
                  disabled={isSelectedProductAdding}
                  onClick={() =>
                    handleAddToCart(selectedVariant.productVariantId)
                  }
                >
                  {isSelectedProductAdding ? (
                    <span
                      className="product-modal__button-spinner"
                      aria-hidden="true"
                    />
                  ) : isProductAdded(selectedVariant.productVariantId)
                    ? "Добавлено"
                    : "В корзину"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
