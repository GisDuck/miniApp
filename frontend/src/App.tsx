import { useEffect, useState } from "react";

import {
  ALL_CATEGORY_TITLE,
  CatalogPage,
  type Category,
  type Product,
} from "./pages/CatalogPage/CatalogPage";
import { CartPage } from "./pages/CartPage/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage/CheckoutPage";
import { ProfilePage } from "./pages/ProfilePage/ProfilePage";
import { FavoritesPage } from "./pages/FavoritesPage/FavoritesPage";
import { ProductDetailsPage } from "./pages/ProductDetailsPage/ProductDetailsPage";
import {
  BottomNav,
  type BottomNavTab,
} from "./components/BottomNav/BottomNav";
import { initTelegramApp } from "./shared/telegram";
import { apiTGInitFetch } from "./shared/apiTGInitFetch";
import { getApiUrl } from "./api/api";
import type { CatalogProduct, CatalogProductVariant } from "./types/product";

type ProductVariantFromApi = Omit<CatalogProductVariant, "price"> & {
  price: number | string;
};

type ProductFromApi = Omit<CatalogProduct, "mainVariant" | "variants"> & {
  mainVariant: ProductVariantFromApi;
  variants: ProductVariantFromApi[];
};

type CartResponse = {
  totalQuantity: number;
};

let categoriesRequest: Promise<Category[]> | null = null;
let productsRequest: Promise<Product[]> | null = null;

function normalizeProduct(product: ProductFromApi): Product {
  const variants = product.variants.map((variant) => ({
    ...variant,
    price: Number(variant.price),
  }));

  return {
    ...product,
    mainVariant: {
      ...product.mainVariant,
      price: Number(product.mainVariant.price),
    },
    variants,
  };
}

function requestCategories() {
  if (categoriesRequest) {
    return categoriesRequest;
  }

  categoriesRequest = fetch(getApiUrl("/categories"))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить категории");
      }

      const categoriesFromApi = (await response.json()) as Category[];

      const hasAllCategory = categoriesFromApi.some(
        (category) => category.title === ALL_CATEGORY_TITLE,
      );

      return hasAllCategory
        ? categoriesFromApi
        : [{ id: 0, title: ALL_CATEGORY_TITLE }, ...categoriesFromApi];
    })
    .catch((error) => {
      categoriesRequest = null;
      throw error;
    });

  return categoriesRequest;
}

function requestProducts() {
  if (productsRequest) {
    return productsRequest;
  }

  productsRequest = apiTGInitFetch("/products")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить товары");
      }

      const productsFromApi = (await response.json()) as ProductFromApi[];

      return productsFromApi.map(normalizeProduct);
    })
    .catch((error) => {
      productsRequest = null;
      throw error;
    });

  return productsRequest;
}

function requestFavorites() {
  return apiTGInitFetch("/favorites")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·Р±СЂР°РЅРЅРѕРµ");
      }

      const productsFromApi = (await response.json()) as ProductFromApi[];

      return productsFromApi.map(normalizeProduct);
    });
}

async function requestProduct(productId: number) {
  const response = await apiTGInitFetch(`/products/${productId}`);

  if (!response.ok) {
    throw new Error("Не получилось загрузить товар");
  }

  const productFromApi = (await response.json()) as ProductFromApi;

  return normalizeProduct(productFromApi);
}

export function App() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("catalog");
  const [cartCount, setCartCount] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedProductDetails, setSelectedProductDetails] =
    useState<Product | null>(null);
  const [isProductDetailsLoading, setIsProductDetailsLoading] = useState(false);
  const [productDetailsError, setProductDetailsError] = useState<string | null>(
    null,
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);

  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  useEffect(() => {
    initTelegramApp();

    const controller = new AbortController();

    async function loadCartCount() {
      try {
        const response = await apiTGInitFetch("/cart", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить корзину");
        }

        const cart = (await response.json()) as CartResponse;
        setCartCount(cart.totalQuantity);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setCartCount(0);
      }
    }

    loadCartCount();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let isActual = true;

    async function loadCategories() {
      setIsCategoriesLoading(true);
      setCategoriesError(null);

      try {
        const loadedCategories = await requestCategories();

        if (!isActual) {
          return;
        }

        setCategories(loadedCategories);
      } catch {
        if (!isActual) {
          return;
        }

        setCategoriesError(
          "Не получилось загрузить категории. Проверь backend и адрес API.",
        );
      } finally {
        if (isActual) {
          setIsCategoriesLoading(false);
        }
      }
    }

    async function loadProducts() {
      setIsProductsLoading(true);
      setProductsError(null);

      try {
        const loadedProducts = await requestProducts();

        if (!isActual) {
          return;
        }

        setProducts(loadedProducts);
      } catch {
        if (!isActual) {
          return;
        }

        setProducts([]);
        setProductsError(
          "Не получилось загрузить товары",
        );
      } finally {
        if (isActual) {
          setIsProductsLoading(false);
        }
      }
    }

    async function loadFavorites() {
      setIsFavoritesLoading(true);
      setFavoritesError(null);

      try {
        const loadedFavorites = await requestFavorites();

        if (!isActual) {
          return;
        }

        setFavoriteProducts(loadedFavorites);
      } catch {
        if (!isActual) {
          return;
        }

        setFavoriteProducts([]);
        setFavoritesError(
          "РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·Р±СЂР°РЅРЅРѕРµ",
        );
      } finally {
        if (isActual) {
          setIsFavoritesLoading(false);
        }
      }
    }

    void loadFavorites;

    loadCategories();
    loadProducts();

    return () => {
      isActual = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "favorites") {
      return;
    }

    let isActual = true;

    async function loadFavorites() {
      setIsFavoritesLoading(true);
      setFavoritesError(null);

      try {
        const loadedFavorites = await requestFavorites();

        if (!isActual) {
          return;
        }

        setFavoriteProducts(loadedFavorites);
      } catch {
        if (!isActual) {
          return;
        }

        setFavoriteProducts([]);
        setFavoritesError(
          "РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·Р±СЂР°РЅРЅРѕРµ",
        );
      } finally {
        if (isActual) {
          setIsFavoritesLoading(false);
        }
      }
    }

    loadFavorites();

    return () => {
      isActual = false;
    };
  }, [activeTab]);

  function handleTabChange(nextTab: BottomNavTab) {
    setActiveTab(nextTab);
    setIsCheckoutOpen(false);
    setSelectedProductDetails(null);
    setProductDetailsError(null);
  }

  async function handleProductOpen(productId: number, forceRequest = false) {
    const cachedProduct = [...products, ...favoriteProducts].find(
      (product) => product.productId === productId,
    );

    setIsCheckoutOpen(false);
    setProductDetailsError(null);

    if (cachedProduct && !forceRequest) {
      setSelectedProductDetails(cachedProduct);
      return;
    }

    setSelectedProductDetails(null);
    setIsProductDetailsLoading(true);

    try {
      const loadedProduct = await requestProduct(productId);
      setSelectedProductDetails(loadedProduct);
    } catch {
      setProductDetailsError("Не получилось открыть товар");
    } finally {
      setIsProductDetailsLoading(false);
    }
  }

  function handleProductDetailsBack() {
    setSelectedProductDetails(null);
    setProductDetailsError(null);
  }

  function handleProductFavoriteChange(productId: number, isFavorite: boolean) {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.productId === productId
          ? {
              ...product,
              isFavorite,
            }
          : product,
      ),
    );

    setFavoriteProducts((currentProducts) => {
      if (!isFavorite) {
        return currentProducts.filter(
          (product) => product.productId !== productId,
        );
      }

      return currentProducts.map((product) =>
        product.productId === productId
          ? {
              ...product,
              isFavorite,
            }
          : product,
      );
    });

    setSelectedProductDetails((currentProduct) =>
      currentProduct?.productId === productId
        ? {
            ...currentProduct,
            isFavorite,
          }
        : currentProduct,
    );
  }

  return (
    <div className="app">
      <main className="app-content">
        {selectedProductDetails && (
          <ProductDetailsPage
            product={selectedProductDetails}
            onBack={handleProductDetailsBack}
            onCartCountChange={setCartCount}
            onProductFavoriteChange={handleProductFavoriteChange}
          />
        )}

        {isProductDetailsLoading && (
          <section className="app-status-page">
            <p className="app-status-page__text">Загрузка товара...</p>
          </section>
        )}

        {productDetailsError && !isProductDetailsLoading && (
          <section className="app-status-page">
            <p className="app-status-page__text app-status-page__text--error">
              {productDetailsError}
            </p>
            <button
              className="app-status-page__button"
              type="button"
              onClick={handleProductDetailsBack}
            >
              Назад
            </button>
          </section>
        )}

        {!selectedProductDetails &&
          !isProductDetailsLoading &&
          !productDetailsError &&
          activeTab === "catalog" && (
          <CatalogPage
            categories={categories}
            products={products}
            isCategoriesLoading={isCategoriesLoading}
            isProductsLoading={isProductsLoading}
            categoriesError={categoriesError}
            productsError={productsError}
            onCartCountChange={setCartCount}
            onProductFavoriteChange={handleProductFavoriteChange}
            onProductOpen={handleProductOpen}
          />
        )}

        {!selectedProductDetails &&
          !isProductDetailsLoading &&
          !productDetailsError &&
          activeTab === "favorites" && (
          <FavoritesPage
            products={favoriteProducts}
            isProductsLoading={isFavoritesLoading}
            productsError={favoritesError}
            onCartCountChange={setCartCount}
            onProductFavoriteChange={handleProductFavoriteChange}
            onProductOpen={handleProductOpen}
          />
        )}

        {!selectedProductDetails &&
          !isProductDetailsLoading &&
          !productDetailsError &&
          activeTab === "cart" &&
          (isCheckoutOpen ? (
            <CheckoutPage
              onBack={() => setIsCheckoutOpen(false)}
              onOrderCreated={() => setCartCount(0)}
            />
          ) : (
            <CartPage
              onCartCountChange={setCartCount}
              onCheckoutClick={() => setIsCheckoutOpen(true)}
              onProductOpen={handleProductOpen}
            />
          ))}

        {!selectedProductDetails &&
          !isProductDetailsLoading &&
          !productDetailsError &&
          activeTab === "profile" && (
            <ProfilePage
              onProductOpen={(productId) => handleProductOpen(productId, true)}
            />
          )}
      </main>

      <BottomNav
        activeTab={activeTab}
        cartCount={cartCount}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
