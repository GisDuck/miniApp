import { useEffect, useMemo, useRef, useState } from "react";

import { ProductCard } from "../../components/ProductCard/ProductCard";
import { getApiUrl } from "../../api/api";
import "./CatalogPage.css";
import CloseIcon from "../../assets/icons/close.svg?react";
import SearchIcon from "../../assets/icons/search.svg?react";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type Category = {
  id: number;
  title: string;
};

type Product = {
  id: number;
  title: string;
  price: number;
  imageUrl: string;
  description: string;
  category: string;
};

type ProductFromApi = Omit<Product, "price"> & {
  price: number | string;
};

type AddToCartResponse = {
  id: number;
  productId: number;
  quantity: number;
  cartCount?: number;
};

type CartResponse = {
  totalQuantity: number;
};

type CatalogPageProps = {
  onCartCountChange: (cartCount: number) => void;
};

const ALL_CATEGORY_TITLE = "Все";

function normalizeProduct(product: ProductFromApi): Product {
  return {
    ...product,
    price: Number(product.price),
  };
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

export function CatalogPage({ onCartCountChange }: CatalogPageProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_TITLE);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<number[]>([]);
  const [addingProductIds, setAddingProductIds] = useState<number[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setIsCategoriesLoading(true);
      setCategoriesError(null);

      try {
        const response = await fetch(getApiUrl("/categories"), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить категории");
        }

        const categoriesFromApi = (await response.json()) as Category[];
        const hasAllCategory = categoriesFromApi.some(
          (category) => category.title === ALL_CATEGORY_TITLE,
        );

        setCategories(
          hasAllCategory
            ? categoriesFromApi
            : [{ id: 0, title: ALL_CATEGORY_TITLE }, ...categoriesFromApi],
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setCategoriesError(
          "Не получилось загрузить категории. Проверь backend и адрес API.",
        );
      } finally {
        setIsCategoriesLoading(false);
      }
    }

    loadCategories();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setIsProductsLoading(true);
      setProductsError(null);

      try {
        const response = await fetch(getApiUrl("/products"), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить товары");
        }

        const productsFromApi = (await response.json()) as ProductFromApi[];
        setAllProducts(productsFromApi.map(normalizeProduct));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setAllProducts([]);
        setProductsError(
          "Не получилось загрузить товары. Проверь backend и адрес API.",
        );
      } finally {
        setIsProductsLoading(false);
      }
    }

    loadProducts();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const isSearchActive = normalizedSearchQuery.length > 0;

  const visibleProducts = useMemo(() => {
    const productsByCategory =
      activeCategory === ALL_CATEGORY_TITLE
        ? allProducts
        : allProducts.filter((product) => product.category === activeCategory);

    if (!normalizedSearchQuery) {
      return productsByCategory;
    }

    return productsByCategory.filter((product) =>
      product.title.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [activeCategory, allProducts, normalizedSearchQuery]);

  function handleSearchButtonClick() {
    setIsSearchOpen(true);
  }

  function handleCloseSearch() {
    setSearchQuery("");
    setIsSearchOpen(false);
  }

  function handleOpenProduct(productId: number) {
    const product = allProducts.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    setSelectedProduct(product);
  }

  async function loadCartCount() {
    const response = await apiTGInitFetch("/cart");

    if (!response.ok) {
      throw new Error("Не удалось загрузить корзину");
    }

    const cart = (await response.json()) as CartResponse;
    onCartCountChange(cart.totalQuantity);
  }

  async function handleAddToCart(productId: number) {
    if (addingProductIds.includes(productId)) {
      return;
    }

    setCartError(null);
    setAddingProductIds((currentIds) => [...currentIds, productId]);

    try {
      const response = await apiTGInitFetch("/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          quantity: 1,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить товар в корзину");
      }

      const cartData = (await response.json()) as AddToCartResponse;

      setAddedProductIds((currentIds) => {
        if (currentIds.includes(productId)) {
          return currentIds;
        }

        return [...currentIds, productId];
      });

      if (typeof cartData.cartCount === "number") {
        onCartCountChange(cartData.cartCount);
      } else {
        await loadCartCount();
      }
    } catch {
      setCartError("Не получилось добавить товар в корзину. Проверь backend.");
    } finally {
      setAddingProductIds((currentIds) =>
        currentIds.filter((id) => id !== productId),
      );
    }
  }

  function isProductAdded(productId: number) {
    return addedProductIds.includes(productId);
  }

  function isProductAdding(productId: number) {
    return addingProductIds.includes(productId);
  }

  const isLoading = isCategoriesLoading || isProductsLoading;

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
            placeholder="Поиск по названию"
            aria-label="Поиск по названию товара"
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
          <h1 className="catalog-header__title">Каталог</h1>
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

      {isLoading && <p className="catalog-status">Загрузка каталога...</p>}

      {categoriesError && !isCategoriesLoading && (
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

      {!productsError && !isProductsLoading && visibleProducts.length === 0 && (
        <p className="catalog-status">
          {isSearchActive
            ? `По запросу «${trimmedSearchQuery}» ничего не найдено.`
            : "В этой категории пока нет товаров."}
        </p>
      )}

      {!isProductsLoading && visibleProducts.length > 0 && (
        <div className="catalog-grid">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isAdded={isProductAdded(product.id)}
              isAdding={isProductAdding(product.id)}
              onOpen={handleOpenProduct}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      )}

      {selectedProduct && (
        <div className="product-modal" role="dialog" aria-modal="true">
          <button
            className="product-modal__backdrop"
            type="button"
            aria-label="Закрыть"
            onClick={() => setSelectedProduct(null)}
          />

          <div className="product-modal__panel">
            <button
              className="product-modal__close"
              type="button"
              onClick={() => setSelectedProduct(null)}
              aria-label="Закрыть"
            >
              <CloseIcon
                className="product-modal__close-icon"
                aria-hidden="true"
                focusable="false"
              />
            </button>

            <img
              className="product-modal__image"
              src={selectedProduct.imageUrl}
              alt={selectedProduct.title}
            />

            <div className="product-modal__body">
              <p className="product-modal__category">
                {selectedProduct.category}
              </p>

              <h2 className="product-modal__title">{selectedProduct.title}</h2>

              <p className="product-modal__description">
                {selectedProduct.description}
              </p>

              <div className="product-modal__footer">
                <strong className="product-modal__price">
                  {formatPrice(selectedProduct.price)}
                </strong>

                <button
                  className="product-modal__button"
                  type="button"
                  disabled={isProductAdding(selectedProduct.id)}
                  onClick={() => handleAddToCart(selectedProduct.id)}
                >
                  {isProductAdded(selectedProduct.id) ? "Добавлено" : "В корзину"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
