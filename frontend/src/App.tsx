import { useEffect, useRef, useState } from "react";

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
import { ProductDetailsPageSkeleton } from "./pages/ProductDetailsPage/ProductDetailsPageSkeleton";
import {
  BottomNav,
  type BottomNavTab,
} from "./components/BottomNav/BottomNav";
import { StoreHeader } from "./components/StoreHeader/StoreHeader";
import { getTelegramWebApp, initTelegramApp } from "./shared/telegram";
import { apiTGInitFetch } from "./shared/apiTGInitFetch";
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
  return apiTGInitFetch("/categories")
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
        : [{ id: "all", title: ALL_CATEGORY_TITLE }, ...categoriesFromApi];
    });
}

function requestProducts() {
  return apiTGInitFetch("/products")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить товары");
      }

      const productsFromApi = (await response.json()) as ProductFromApi[];

      return productsFromApi.map(normalizeProduct);
    });
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

async function requestProduct(productId: string) {
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
  const [selectedProductInitialVariantId, setSelectedProductInitialVariantId] =
    useState<string | null>(null);
  const [isProductDetailsLoading, setIsProductDetailsLoading] = useState(false);
  const [productDetailsError, setProductDetailsError] = useState<string | null>(
    null,
  );
  const productDetailsRequestId = useRef(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);

  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const isProductPageOpen =
    Boolean(selectedProductDetails) ||
    isProductDetailsLoading ||
    Boolean(productDetailsError);

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
    if (activeTab !== "catalog") {
      return;
    }

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
          "Не получилось загрузить категории",
        );
      } finally {
        if (isActual) {
          setIsCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      isActual = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "catalog") {
      return;
    }

    let isActual = true;

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
        setProductsError("Не получилось загрузить товары");
      } finally {
        if (isActual) {
          setIsProductsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isActual = false;
    };
  }, [activeTab]);

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
    setSelectedProductInitialVariantId(null);
    setProductDetailsError(null);
  }

  async function handleProductOpen(
    productId: string,
    productVariantId: string | null = null,
    forceRequest = false,
  ) {
    const requestId = productDetailsRequestId.current + 1;
    productDetailsRequestId.current = requestId;
    const cachedProduct = [...products, ...favoriteProducts].find(
      (product) => product.productId === productId,
    );
    const hasRequestedVariant =
      productVariantId === null ||
      cachedProduct?.variants.some(
        (variant) => variant.productVariantId === productVariantId,
      );

    setIsCheckoutOpen(false);
    setProductDetailsError(null);
    setSelectedProductInitialVariantId(productVariantId);

    if (cachedProduct && !forceRequest && hasRequestedVariant) {
      setIsProductDetailsLoading(false);
      setSelectedProductDetails(cachedProduct);
      return;
    }

    setSelectedProductDetails(null);
    setIsProductDetailsLoading(true);

    try {
      const loadedProduct = await requestProduct(productId);
      if (productDetailsRequestId.current !== requestId) {
        return;
      }

      setSelectedProductDetails(loadedProduct);
    } catch {
      if (productDetailsRequestId.current !== requestId) {
        return;
      }

      setProductDetailsError("Не получилось открыть товар");
    } finally {
      if (productDetailsRequestId.current === requestId) {
        setIsProductDetailsLoading(false);
      }
    }
  }

  function handleProductDetailsBack() {
    productDetailsRequestId.current += 1;
    setSelectedProductDetails(null);
    setSelectedProductInitialVariantId(null);
    setIsProductDetailsLoading(false);
    setProductDetailsError(null);
  }

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) {
      return;
    }

    if (!isProductPageOpen) {
      backButton.hide();
      return;
    }

    backButton.show();
    backButton.onClick(handleProductDetailsBack);

    return () => {
      backButton.offClick(handleProductDetailsBack);
    };
  }, [selectedProductDetails, isProductDetailsLoading, productDetailsError]);

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) {
      return;
    }

    if (!isCheckoutOpen) {
      backButton.hide();
      return;
    }

    const handleCheckoutBack = () => {
      setIsCheckoutOpen(false);
    };

    backButton.show();
    backButton.onClick(handleCheckoutBack);

    return () => {
      backButton.offClick(handleCheckoutBack);
    };
  }, [isCheckoutOpen]);

  function handleProductFavoriteChange(productId: string, isFavorite: boolean) {
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
      {!selectedProductDetails &&
        !isProductDetailsLoading &&
        !productDetailsError && <StoreHeader />}

      <main className="app-content">
        {selectedProductDetails && (
          <ProductDetailsPage
            product={selectedProductDetails}
            initialVariantId={selectedProductInitialVariantId}
            onCartCountChange={setCartCount}
            onProductFavoriteChange={handleProductFavoriteChange}
          />
        )}

        {isProductDetailsLoading && <ProductDetailsPageSkeleton />}

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
          isCheckoutOpen && (
            <CheckoutPage
              onBack={() => setIsCheckoutOpen(false)}
              onOrderCreated={setCartCount}
            />
          )}

        {!selectedProductDetails &&
          !isProductDetailsLoading &&
          !productDetailsError &&
          !isCheckoutOpen &&
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
          !isCheckoutOpen &&
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
          !isCheckoutOpen &&
          activeTab === "cart" &&
            <CartPage
              onCartCountChange={setCartCount}
              onCheckoutClick={() => setIsCheckoutOpen(true)}
              onProductOpen={handleProductOpen}
            />
          }

        {!isCheckoutOpen && activeTab === "profile" && (
            <div hidden={isProductPageOpen}>
              <ProfilePage
                isProductDetailsOpen={isProductPageOpen}
                onCartCountChange={setCartCount}
                onProductOpen={(productId, productVariantId) =>
                  handleProductOpen(productId, productVariantId ?? null, true)
                }
              />
            </div>
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
