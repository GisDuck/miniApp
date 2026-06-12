import { useEffect, useState } from "react";

import { CatalogPage } from "./pages/CatalogPage/CatalogPage";
import { CartPage } from "./pages/CartPage/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage/CheckoutPage";
import {
  BottomNav,
  type BottomNavTab,
} from "./components/BottomNav/BottomNav";
import { initTelegramApp } from "./shared/telegram";
import { apiTGInitFetch } from "./shared/apiTGInitFetch";

type CartResponse = {
  totalQuantity: number;
};

export function App() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("catalog");
  const [cartCount, setCartCount] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

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

  function handleTabChange(nextTab: BottomNavTab) {
    setActiveTab(nextTab);
    setIsCheckoutOpen(false);
  }

  return (
    <div className="app">
      <main className="app-content">
        {activeTab === "catalog" && (
          <CatalogPage onCartCountChange={setCartCount} />
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

        {activeTab === "profile" && (
          <div className="stub-page">
            <h1>Профиль</h1>
            <p>Здесь будет профиль пользователя.</p>
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