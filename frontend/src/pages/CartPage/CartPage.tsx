import { useEffect, useState } from "react";

import {
  CartItemCard,
  type CartStockStatus,
  type CartItemCardData,
} from "../../components/CartItemCard/CartItemCard";
import { FloatingActionBar } from "../../components/FloatingActionBar/FloatingActionBar";
import { CartPageSkeleton } from "./CartPageSkeleton";
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
  availableQuantity: number;
  lineTotal: number | string;
  stockStatus: CartStockStatus;
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
  onProductOpen: (productId: number, productVariantId?: number | null) => void;
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
      availableQuantity: item.availableQuantity,
      lineTotal: Number(item.lineTotal),
      stockStatus: item.stockStatus,
    })),
    totalQuantity: cart.cartCount ?? cart.totalQuantity,
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
  const [isStockWarningOpen, setIsStockWarningOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<CartItem | null>(
    null,
  );
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
      onCartCountChange(nextCart.cartCount ?? nextCart.totalQuantity);
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
      onCartCountChange(nextCart.cartCount ?? nextCart.totalQuantity);
      return;
    }

    await loadCart(undefined, false);
  }

  async function handleQuantityChange(
    productVariantId: number,
    nextQuantity: number,
  ) {
    if (nextQuantity <= 0) {
      const item = cart?.items.find(
        (cartItem) => cartItem.productVariantId === productVariantId,
      );

      if (item) {
        setItemPendingDelete(item);
      }

      return;
    }

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
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не получилось изменить количество товара в корзине.",
      );
    } finally {
      setUpdatingProductVariantIds((currentIds) =>
        currentIds.filter((id) => id !== productVariantId),
      );
    }
  }

  function isProductUpdating(productVariantId: number) {
    return updatingProductVariantIds.includes(productVariantId);
  }

  function handleDeleteRequest(item: CartItem) {
    setItemPendingDelete(item);
  }

  async function handleConfirmDelete() {
    if (!itemPendingDelete) {
      return;
    }

    const productVariantId = itemPendingDelete.productVariantId;

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
          quantity: 0,
        }),
      });

      await applyCartResponse(response);
      setItemPendingDelete(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не получилось удалить товар из корзины.",
      );
    } finally {
      setUpdatingProductVariantIds((currentIds) =>
        currentIds.filter((id) => id !== productVariantId),
      );
    }
  }

  function handleCheckout() {
    if (!hasAvailableItems) {
      return;
    }

    if (hasQuantityIssues) {
      return;
    }

    if (unavailableItems.length > 0) {
      setIsStockWarningOpen(true);
      return;
    }

    onCheckoutClick();
  }

  function handleContinueCheckout() {
    setIsStockWarningOpen(false);
    onCheckoutClick();
  }

  const availableItems =
    cart?.items.filter((item) => item.stockStatus !== "OUT_OF_STOCK") ?? [];
  const unavailableItems =
    cart?.items.filter((item) => item.stockStatus === "OUT_OF_STOCK") ?? [];
  const hasAvailableItems = availableItems.length > 0;
  const hasQuantityIssues = availableItems.some(
    (item) => item.stockStatus === "LIMITED",
  );
  const cartItemsCount = cart ? (cart.cartCount ?? cart.totalQuantity) : 0;
  const isCartEmpty = cartItemsCount === 0;

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

      {isLoading && <CartPageSkeleton />}

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
          {availableItems.length > 0 && (
            <div className="cart-list">
              {availableItems.map((item) => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  isUpdating={isProductUpdating(item.productVariantId)}
                  onQuantityChange={handleQuantityChange}
                  onDeleteRequest={handleDeleteRequest}
                  onProductOpen={onProductOpen}
                />
              ))}
            </div>
          )}

          {unavailableItems.length > 0 && (
            <section className="cart-unavailable-section">
              <h2 className="cart-section-title">Товар закончился</h2>

              <div className="cart-list">
                {unavailableItems.map((item) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    isUpdating={isProductUpdating(item.productVariantId)}
                    onQuantityChange={handleQuantityChange}
                    onDeleteRequest={handleDeleteRequest}
                    onProductOpen={onProductOpen}
                  />
                ))}
              </div>
            </section>
          )}

          {hasAvailableItems && (
          <FloatingActionBar
            price={formatPrice(cart.totalPrice)}
            priceLabel="Итого"
            actionText={
              hasQuantityIssues ? "Отредактируйте\nзаказ" : "Оформить"
            }
            isActionDisabled={isCartEmpty || hasQuantityIssues}
            onActionClick={handleCheckout}
          />
          )}

          {isStockWarningOpen && (
            <div className="cart-warning" role="dialog" aria-modal="true">
              <div className="cart-warning__panel">
                <p className="cart-warning__text">
                  В вашей корзине есть товары, которые закончились. Мы ожидаем
                  их поставку, а пока вы можете оформить заказ без этих товаров
                  в заказе.
                </p>

                <div className="cart-warning__actions">
                  <button
                    className="cart-warning__button cart-warning__button--no"
                    type="button"
                    onClick={() => setIsStockWarningOpen(false)}
                  >
                    Нет
                  </button>

                  <button
                    className="cart-warning__button cart-warning__button--continue"
                    type="button"
                    onClick={handleContinueCheckout}
                  >
                    Продолжить
                  </button>
                </div>
              </div>
            </div>
          )}

          {itemPendingDelete && (
            <div className="cart-warning" role="dialog" aria-modal="true">
              <div className="cart-warning__panel">
                <p className="cart-warning__text">
                  Вы уверены, что хотите удалить товар из корзины?
                </p>

                <div className="cart-warning__actions">
                  <button
                    className="cart-warning__button cart-warning__button--continue"
                    type="button"
                    onClick={() => setItemPendingDelete(null)}
                  >
                    Отменить
                  </button>

                  <button
                    className="cart-warning__button cart-warning__button--continue"
                    type="button"
                    onClick={handleConfirmDelete}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
