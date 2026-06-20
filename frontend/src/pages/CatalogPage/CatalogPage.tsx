import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

import { ProductCard } from "../../components/ProductCard/ProductCard";
import "./CatalogPage.css";
import CloseIcon from "../../assets/icons/close.svg?react";
import SearchIcon from "../../assets/icons/search.svg?react";
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
  onProductOpen: (productId: number) => void;
  title?: string;
  showCategories?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  loadingText?: string;
  emptyText?: string;
  emptySearchText?: (query: string) => string;
  showOutOfStockSection?: boolean;
  outOfStockTitle?: string;
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

function isVariantAvailable(variant: CatalogProductVariant) {
  return variant.isActive && variant.maxQuantity > 0;
}

function isProductOutOfStock(product: Product) {
  return (
    !product.isActive ||
    product.variants.length === 0 ||
    product.variants.every((variant) => !isVariantAvailable(variant))
  );
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
  onProductOpen,
  title = "Каталог",
  showCategories = true,
  searchPlaceholder = "Поиск по названию",
  searchAriaLabel = "Поиск по названию товара",
  loadingText = "Загрузка каталога...",
  emptyText = "В этой категории пока нет товаров.",
  emptySearchText = (query) => `По запросу «${query}» ничего не найдено.`,
  showOutOfStockSection = false,
  outOfStockTitle = "Товар закончился",
}: CatalogPageProps) {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_TITLE);
  const [addedProductIds, setAddedProductIds] = useState<number[]>([]);
  const [addingProductIds, setAddingProductIds] = useState<number[]>([]);
  const [favoriteUpdatingProductIds, setFavoriteUpdatingProductIds] = useState<
    number[]
  >([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  const availableProducts = showOutOfStockSection
    ? visibleProducts.filter((product) => !isProductOutOfStock(product))
    : visibleProducts;
  const outOfStockProducts = showOutOfStockSection
    ? visibleProducts.filter(isProductOutOfStock)
    : [];

  function handleSearchButtonClick() {
    setIsSearchOpen(true);
  }

  function handleCloseSearch() {
    setSearchQuery("");
    setIsSearchOpen(false);
  }

  function handleOpenProduct(productId: number) {
    onProductOpen(productId);
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

      {!isProductsLoading && availableProducts.length > 0 && (
        <div className="catalog-grid">
          {availableProducts.map((product) => (
            <ProductCard
              key={product.productId}
              product={product}
              isAdded={isProductAdded(product.mainVariant.productVariantId)}
              isAdding={isProductAdding(product.mainVariant.productVariantId)}
              isFavoriteUpdating={isFavoriteUpdating(product.productId)}
              hideAddButton={!isVariantAvailable(product.mainVariant)}
              onOpen={handleOpenProduct}
              onAddToCart={handleAddToCart}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      )}

      {!isProductsLoading && outOfStockProducts.length > 0 && (
        <section className="catalog-section">
          <h2 className="catalog-section__title">{outOfStockTitle}</h2>

          <div className="catalog-grid">
            {outOfStockProducts.map((product) => (
              <ProductCard
                key={product.productId}
                product={product}
                isAdded={isProductAdded(product.mainVariant.productVariantId)}
                isAdding={isProductAdding(product.mainVariant.productVariantId)}
                isFavoriteUpdating={isFavoriteUpdating(product.productId)}
                hideAddButton
                onOpen={handleOpenProduct}
                onAddToCart={handleAddToCart}
                onFavoriteToggle={handleFavoriteToggle}
              />
            ))}
          </div>
        </section>
      )}

    </section>
  );
}
