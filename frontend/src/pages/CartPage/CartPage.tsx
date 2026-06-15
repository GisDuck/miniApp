import { useEffect, useState } from "react";

import {
  CartItemCard,
  type CartItemCardData,
} from "../../components/CartItemCard/CartItemCard";
import "./CartPage.css";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type CartProductFromApi = {
  id: number;
  title: string;
  price: number | string;
  imageUrl: string;
  description: string;
  category: string;
};

type CartItemFromApi = {
  id: number;
  productId: number;
  quantity: number;
  product: CartProductFromApi;
  totalPrice: number | string;
};

type CartResponseFromApi = {
  items: CartItemFromApi[];
  totalQuantity: number;
  totalPrice: number | string;
  cartCount?: number;
};

type CartItem = CartItemCardData;

type Cart = {
  items: CartItem[];
  totalQuantity: number;
  totalPrice: number;
  cartCount?: number;
};

type CartPageProps = {
  onCartCountChange: (cartCount: number) => void;
  onCheckoutClick: () => void;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function normalizeCart(cart: CartResponseFromApi): Cart {
  return {
    items: cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      product: {
        ...item.product,
        price: Number(item.product.price),
      },
      totalPrice: Number(item.totalPrice),
    })),
    totalQuantity: cart.totalQuantity,
    totalPrice: Number(cart.totalPrice),
    cartCount: cart.cartCount,
  };
}

export function CartPage({
  onCartCountChange,
  onCheckoutClick,
}: CartPageProps) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingProductIds, setUpdatingProductIds] = useState<number[]>([]);

  async function loadCart(signal?: AbortSignal, showLoader = true) {
    if (showLoader) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const response = await apiTGInitFetch("/cart", {
        signal,
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить корзину");
      }

      const cartFromApi = (await response.json()) as CartResponseFromApi;
      const nextCart = normalizeCart(cartFromApi);

      setCart(nextCart);
      onCartCountChange(nextCart.totalQuantity);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    loadCart(controller.signal).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setCart(null);
      setError("Не получилось загрузить корзину");
    });

    return () => {
      controller.abort();
    };
  }, []);

  async function applyCartResponse(response: Response) {
    if (!response.ok) {
      throw new Error("Не удалось обновить корзину");
    }

    const data = await response.json();

    if (Array.isArray(data.items)) {
      const nextCart = normalizeCart(data as CartResponseFromApi);

      setCart(nextCart);
      onCartCountChange(nextCart.totalQuantity);
      return;
    }

    await loadCart(undefined, false);
  }

  async function handleQuantityChange(productId: number, nextQuantity: number) {
    if (updatingProductIds.includes(productId)) {
      return;
    }

    setError(null);
    setUpdatingProductIds((currentIds) => [...currentIds, productId]);

    try {
      const response = await apiTGInitFetch(`/cart/items/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: nextQuantity,
        }),
      });

      await applyCartResponse(response);
    } catch {
      setError("Не получилось изменить количество товара в корзине.");
    } finally {
      setUpdatingProductIds((currentIds) =>
        currentIds.filter((id) => id !== productId),
      );
    }
  }

  function isProductUpdating(productId: number) {
    return updatingProductIds.includes(productId);
  }

  function handleCheckout() {
    if (isCartEmpty) {
      return;
    }

    onCheckoutClick();
  }

  const isCartEmpty = !cart || cart.items.length === 0;

  return (
    <section className="cart-page">
      <header className="cart-header">
        <div>
          <h1 className="cart-header__title">Корзина</h1>
          <p className="cart-header__subtitle">
            {cart && cart.totalQuantity > 0
              ? `Товаров: ${cart.totalQuantity}`
              : "Пока пусто"}
          </p>
        </div>
      </header>

      {isLoading && <p className="cart-status">Загрузка корзины...</p>}

      {error && <p className="cart-status cart-status--error">{error}</p>}

      {!isLoading && !error && isCartEmpty && (
        <div className="cart-empty">
          <h2 className="cart-empty__title">Корзина пустая</h2>
          <p className="cart-empty__text">
            Добавь товары из каталога, и они появятся здесь.
          </p>
        </div>
      )}

      {!isLoading && cart && cart.items.length > 0 && (
        <>
          <div className="cart-list">
            {cart.items.map((item) => (
              <CartItemCard
                key={item.id}
                item={item}
                isUpdating={isProductUpdating(item.productId)}
                onQuantityChange={handleQuantityChange}
              />
            ))}
          </div>

          <footer className="cart-summary">
            <div className="cart-summary__total">
              <span className="cart-summary__label">Итого</span>
              <strong className="cart-summary__price">
                {formatPrice(cart.totalPrice)}
              </strong>
            </div>

            <button
              className="cart-summary__button"
              type="button"
              disabled={isCartEmpty}
              onClick={handleCheckout}
            >
              Оформить
            </button>
          </footer>
        </>
      )}
    </section>
  );
}