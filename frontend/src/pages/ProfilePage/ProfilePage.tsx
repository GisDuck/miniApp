import { useCallback, useEffect, useState } from "react";

import { CurrentOrderCard } from "../../components/CurrentOrderCard/CurrentOrderCard";
import { CancelOrderConfirmModal } from "../../components/CancelOrderConfirmModal/CancelOrderConfirmModal";
import type { Order } from "../../components/OrderCard/OrderCard";
import { OrderDetailsPage } from "../OrderDetailsPage/OrderDetailsPage";
import { CheckoutPage } from "../CheckoutPage/CheckoutPage";
import { ProfileOrdersSkeleton } from "./ProfileOrdersSkeleton";
import { TextButton } from "../../components/TextButton/TextButton";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import { getTelegramWebApp } from "../../shared/telegram";
import LightModeIcon from "../../assets/icons/light_mode.svg?react";
import DarkModeIcon from "../../assets/icons/dark_mode.svg?react";
import "./ProfilePage.css";

type TelegramUser = {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type WindowWithTelegram = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: TelegramUser;
      };
    };
  };
};

type ProfileOrdersResponse = {
  currentOrders: Order[];
  historyOrders: Order[];
};

type RepeatOrderResponse = {
  cartCount?: number;
  totalQuantity?: number;
  message?: string;
};

type CartSnapshot = {
  totalQuantity: number;
  cartCount?: number;
  items?: Array<{ productVariantId: string; quantity: number }>;
};

type ProfilePageProps = {
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  onProductOpen: (productId: string, productVariantId?: string | null) => void;
  onCartCountChange: (cartCount: number) => void;
  onCartSnapshotChange?: (cart: CartSnapshot) => void;
  onNotify?: (message: string, type?: "error" | "success") => void;
  isProductDetailsOpen?: boolean;
  onBackButtonNeedChange?: (isNeeded: boolean) => void;
};

function getTelegramUser() {
  return (window as WindowWithTelegram).Telegram?.WebApp?.initDataUnsafe?.user;
}

function getTelegramUserName(user?: TelegramUser) {
  const fullName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (user?.username) {
    return `@${user.username}`;
  }

  return "Пользователь Telegram";
}

function getAvatarInitial(userName: string) {
  return userName.replace("@", "").trim().charAt(0).toUpperCase() || "П";
}

async function requestProfileOrders(): Promise<ProfileOrdersResponse> {
  const response = await apiTGInitFetch("/profile");

  if (!response.ok) {
    throw new Error("PROFILE_ORDERS_REQUEST_FAILED");
  }

  const data = (await response.json()) as Partial<ProfileOrdersResponse>;

  return {
    currentOrders: Array.isArray(data.currentOrders) ? data.currentOrders : [],
    historyOrders: Array.isArray(data.historyOrders) ? data.historyOrders : [],
  };
}

async function requestProfileOrder(orderId: string): Promise<Order> {
  const response = await apiTGInitFetch(`/profile/orders/${orderId}`);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data && typeof data.message === "string"
        ? data.message
        : "Не получилось загрузить заказ",
    );
  }

  return data as Order;
}

export function ProfilePage({
  theme,
  onThemeChange,
  onProductOpen,
  onCartCountChange,
  onCartSnapshotChange,
  onNotify,
  isProductDetailsOpen = false,
  onBackButtonNeedChange,
}: ProfilePageProps) {
  const telegramUser = getTelegramUser();
  const userName = getTelegramUserName(telegramUser);
  const username = telegramUser?.username ? `@${telegramUser.username}` : null;
  const avatarUrl = telegramUser?.photo_url;

  const [isAvatarBroken, setIsAvatarBroken] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [currentOrders, setCurrentOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [orderBeingEdited, setOrderBeingEdited] = useState<Order | null>(null);
  const [orderDetailsLoadingId, setOrderDetailsLoadingId] = useState<string | null>(
    null,
  );
  const [repeatingOrderIds, setRepeatingOrderIds] = useState<string[]>([]);
  const isInternalPageOpen =
    Boolean(orderToCancel) ||
    Boolean(orderBeingEdited) ||
    Boolean(selectedOrder) ||
    isHistoryVisible;

  const loadProfileOrders = useCallback(
    async (options: {
      showLoading?: boolean;
      shouldApply?: () => boolean;
    } = {}) => {
      const shouldApply = options.shouldApply ?? (() => true);

      setOrdersError(null);

      if (options.showLoading) {
        setIsOrdersLoading(true);
      }

      try {
        const profileOrders = await requestProfileOrders();

        if (shouldApply()) {
          setCurrentOrders(profileOrders.currentOrders);
          setHistoryOrders(profileOrders.historyOrders);
        }
      } catch {
        if (shouldApply()) {
          setCurrentOrders([]);
          setHistoryOrders([]);
          setOrdersError("Не получилось загрузить заказы");
        }
      } finally {
        if (options.showLoading && shouldApply()) {
          setIsOrdersLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    loadProfileOrders({
      showLoading: true,
      shouldApply: () => isMounted,
    });

    return () => {
      isMounted = false;
    };
  }, [loadProfileOrders]);

  useEffect(() => {
    if (ordersError) {
      onNotify?.(ordersError, "error");
    }
  }, [ordersError, onNotify]);

  function handleInternalBack() {
    if (orderToCancel) {
      setOrderToCancel(null);
      return;
    }

    if (orderBeingEdited) {
      setOrderBeingEdited(null);
      return;
    }

    if (selectedOrder) {
      setSelectedOrder(null);
      return;
    }

    if (isHistoryVisible) {
      setIsHistoryVisible(false);
    }
  }

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (isProductDetailsOpen) {
      return;
    }

    if (!backButton || !isInternalPageOpen) {
      return;
    }

    backButton.show();
    backButton.onClick(handleInternalBack);

    return () => {
      backButton.offClick(handleInternalBack);
      backButton.hide();
    };
  }, [
    isHistoryVisible,
    selectedOrder,
    orderToCancel,
    orderBeingEdited,
    isProductDetailsOpen,
  ]);

  useEffect(() => {
    onBackButtonNeedChange?.(isInternalPageOpen);

    return () => {
      onBackButtonNeedChange?.(false);
    };
  }, [isInternalPageOpen, onBackButtonNeedChange]);

  async function refreshProfileOrdersAfterUpdate(order: Order) {
    await loadProfileOrders();
    setSelectedOrder((currentOrder) =>
      currentOrder?.id === order.id ? order : currentOrder,
    );
  }

  async function handleCancelOrderConfirm() {
    if (!orderToCancel) {
      return;
    }

    try {
      const response = await apiTGInitFetch(
        `/profile/orders/${orderToCancel.id}/cancel`,
        {
          method: "POST",
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data && typeof data.message === "string"
            ? data.message
            : "Не получилось отменить заказ",
        );
      }

      await refreshProfileOrdersAfterUpdate(data as Order);
      setOrderToCancel(null);
    } catch (error) {
      setOrdersError(
        error instanceof Error ? error.message : "Не получилось отменить заказ",
      );
      setOrderToCancel(null);
    }
  }

  async function handleOrderOpen(order: Order) {
    if (orderDetailsLoadingId === order.id) {
      return;
    }

    setOrdersError(null);
    setOrderDetailsLoadingId(order.id);

    try {
      const fullOrder = await requestProfileOrder(order.id);

      setSelectedOrder(fullOrder);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не получилось загрузить заказ";

      setOrdersError(message);
    } finally {
      setOrderDetailsLoadingId((currentOrderId) =>
        currentOrderId === order.id ? null : currentOrderId,
      );
    }
  }

  function handleEditOrderClick(order: Order) {
    setOrderBeingEdited(order);
  }

  async function handleRepeatOrder(order: Order) {
    if (repeatingOrderIds.includes(order.id)) {
      return;
    }

    setOrdersError(null);
    setRepeatingOrderIds((orderIds) => [...orderIds, order.id]);

    try {
      const response = await apiTGInitFetch(`/profile/orders/${order.id}/repeat`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | RepeatOrderResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data && "message" in data && typeof data.message === "string"
            ? data.message
            : "Не получилось повторить заказ",
        );
      }

      const nextCartCount =
        typeof data?.cartCount === "number"
          ? data.cartCount
          : typeof data?.totalQuantity === "number"
            ? data.totalQuantity
            : null;

      if (nextCartCount !== null) {
        onCartCountChange(nextCartCount);
      }

      if (onCartSnapshotChange) {
        const cartResponse = await apiTGInitFetch("/cart");

        if (cartResponse.ok) {
          onCartSnapshotChange((await cartResponse.json()) as CartSnapshot);
        }
      }

      onNotify?.("Товары добавлены в корзину", "success");
    } catch (error) {
      onNotify?.(
        error instanceof Error ? error.message : "Не получилось повторить заказ",
        "error",
      );
    } finally {
      setRepeatingOrderIds((orderIds) =>
        orderIds.filter((orderId) => orderId !== order.id),
      );
    }
  }

  if (orderBeingEdited) {
    return (
      <section className="profile-page profile-page--subpage">
        <CheckoutPage
          editOrder={orderBeingEdited}
          onBack={() => setOrderBeingEdited(null)}
          onNotify={onNotify}
          onOrderUpdated={(order) => {
            refreshProfileOrdersAfterUpdate(order);
            setOrderBeingEdited(order);
          }}
        />
      </section>
    );
  }

  if (selectedOrder) {
    return (
      <section className="profile-page profile-page--subpage">
        <OrderDetailsPage
          order={selectedOrder}
          onCancel={setOrderToCancel}
          onEdit={handleEditOrderClick}
          onRepeat={handleRepeatOrder}
          onProductOpen={onProductOpen}
          isRepeating={repeatingOrderIds.includes(selectedOrder.id)}
        />

        {orderToCancel && (
          <CancelOrderConfirmModal
            onClose={() => setOrderToCancel(null)}
            onConfirm={handleCancelOrderConfirm}
          />
        )}
      </section>
    );
  }

  if (isHistoryVisible) {
    return (
      <section className="profile-page profile-page--subpage">
        <header className="profile-history-page__header">
          <h1 className="profile-history-page__title">История заказов</h1>
        </header>

        <div className="profile-history-page__content">
          {isOrdersLoading && <ProfileOrdersSkeleton />}

          {!isOrdersLoading &&
            !ordersError &&
            historyOrders.length === 0 && (
              <div className="profile-empty">
                <h2 className="profile-empty__title">
                  Истории заказов пока нет
                </h2>
              </div>
            )}

          {!isOrdersLoading && !ordersError && historyOrders.length > 0 && (
            <div className="profile-orders__list">
              {historyOrders.map((order) => (
                <CurrentOrderCard
                  order={order}
                  key={order.id}
                  onClick={handleOrderOpen}
                  onProductOpen={onProductOpen}
                  showStatus={order.status === "CANCELED"}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <header className="profile-header">
        <h1 className="profile-header__title">Профиль</h1>
        <div className="profile-theme-switcher" aria-label="Theme">
          <span className="profile-theme-switcher__thumb" aria-hidden="true" />
          <button
            className={[
              "profile-theme-switcher__button",
              theme === "light" ? "profile-theme-switcher__button--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label="Light theme"
            aria-pressed={theme === "light"}
            onClick={() => onThemeChange("light")}
          >
            <LightModeIcon
              className="profile-theme-switcher__icon"
              aria-hidden="true"
            />
          </button>
          <button
            className={[
              "profile-theme-switcher__button",
              theme === "dark" ? "profile-theme-switcher__button--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label="Dark theme"
            aria-pressed={theme === "dark"}
            onClick={() => onThemeChange("dark")}
          >
            <DarkModeIcon
              className="profile-theme-switcher__icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <div className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
          {avatarUrl && !isAvatarBroken ? (
            <img
              className="profile-avatar__image"
              src={avatarUrl}
              alt=""
              onError={() => setIsAvatarBroken(true)}
            />
          ) : (
            <span className="profile-avatar__placeholder">
              {getAvatarInitial(userName)}
            </span>
          )}
        </div>

        <div className="profile-info">
          <h2 className="profile-info__name">{userName}</h2>

          {username && userName !== username && (
            <p className="profile-info__username">{username}</p>
          )}
        </div>
      </div>

      <div className="profile-current-orders">
        {isOrdersLoading && <ProfileOrdersSkeleton />}

        {!isOrdersLoading && !ordersError && currentOrders.length > 0 && (
          <div className="profile-current-orders__list">
            {currentOrders.map((order) => (
              <CurrentOrderCard
                order={order}
                key={order.id}
                onClick={handleOrderOpen}
                onProductOpen={onProductOpen}
              />
            ))}
          </div>
        )}
      </div>

      <TextButton
        className="profile-orders-button"
        type="button"
        centerWidth
        onClick={() => setIsHistoryVisible(true)}
      >
        История заказов
      </TextButton>

      {orderToCancel && (
        <CancelOrderConfirmModal
          onClose={() => setOrderToCancel(null)}
          onConfirm={handleCancelOrderConfirm}
        />
      )}
    </section>
  );
}

