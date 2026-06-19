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

  productsRequest = fetch(getApiUrl("/products"))
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

export function App() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("catalog");
  const [cartCount, setCartCount] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);

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

    loadCategories();
    loadProducts();

    return () => {
      isActual = false;
    };
  }, []);

  function handleTabChange(nextTab: BottomNavTab) {
    setActiveTab(nextTab);
    setIsCheckoutOpen(false);
  }

  return (
    <div className="app">
      <main className="app-content">
        {activeTab === "catalog" && (
          <CatalogPage
            categories={categories}
            products={products}
            isCategoriesLoading={isCategoriesLoading}
            isProductsLoading={isProductsLoading}
            categoriesError={categoriesError}
            productsError={productsError}
            onCartCountChange={setCartCount}
          />
        )}

        {activeTab === "favorites" && (
          <div className="stub-page">
            <h1>Избранное</h1>
            <p>Здесь будут избранные товары.</p>
          </div>
        )}

        {activeTab === "cart" &&
          (isCheckoutOpen ? (
            <CheckoutPage
              onBack={() => setIsCheckoutOpen(false)}
              onOrderCreated={() => setCartCount(0)}
            />
          ) : (
            <CartPage
              onCartCountChange={setCartCount}
              onCheckoutClick={() => setIsCheckoutOpen(true)}
            />
          ))}

        {activeTab === "profile" && <ProfilePage />}
      </main>

      <BottomNav
        activeTab={activeTab}
        cartCount={cartCount}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
