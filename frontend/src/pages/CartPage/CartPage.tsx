import { useEffect, useState } from "react";

import {
  CartItemCard,
  type CartItemCardData,
} from "../../components/CartItemCard/CartItemCard";
import { FloatingActionBar } from "../../components/FloatingActionBar/FloatingActionBar";
import "./CartPage.css";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type CartItemFromApi = {
  id: number;
  productId: number;
  productVariantId: number;
  title: string;
  optionLabel: string;
  price: number | string;
  imageUrl: string | null;
  quantity: number;
  maxQuantity: number;
  lineTotal: number | string;
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
  onProductOpen: (productId: number) => void;
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
      productVariantId: item.productVariantId,
      title: item.title,
      optionLabel: item.optionLabel,
      price: Number(item.price),
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      maxQuantity: item.maxQuantity,
      lineTotal: Number(item.lineTotal),
    })),
    totalQuantity: cart.totalQuantity,
    totalPrice: Number(cart.totalPrice),
    cartCount: cart.cartCount,
  };
}

export function CartPage({
  onCartCountChange,
  onCheckoutClick,
  onProductOpen,
}: CartPageProps) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingProductVariantIds, setUpdatingProductVariantIds] = useState<
    number[]
  >([]);

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

  async function handleQuantityChange(
    productVariantId: number,
    nextQuantity: number,
  ) {
    if (updatingProductVariantIds.includes(productVariantId)) {
      return;
    }

    setError(null);
    setUpdatingProductVariantIds((currentIds) => [
      ...currentIds,
      productVariantId,
    ]);

    try {
      const response = await apiTGInitFetch(`/cart/items/${productVariantId}`, {
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
      setUpdatingProductVariantIds((currentIds) =>
        currentIds.filter((id) => id !== productVariantId),
      );
    }
  }

  function isProductUpdating(productVariantId: number) {
    return updatingProductVariantIds.includes(productVariantId);
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
                isUpdating={isProductUpdating(item.productVariantId)}
                onQuantityChange={handleQuantityChange}
                onProductOpen={onProductOpen}
              />
            ))}
          </div>

          <FloatingActionBar
            price={formatPrice(cart.totalPrice)}
            priceLabel="Итого"
            actionText="Оформить"
            isActionDisabled={isCartEmpty}
            onActionClick={handleCheckout}
          />
        </>
      )}
    </section>
  );
}
