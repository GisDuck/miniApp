import { useEffect, useMemo, useState } from "react";

import { CurrentOrderCard } from "../../components/CurrentOrderCard/CurrentOrderCard";
import { CancelOrderConfirmModal } from "../../components/CancelOrderConfirmModal/CancelOrderConfirmModal";
import { OrderCard, type Order } from "../../components/OrderCard/OrderCard";
import { OrderDetailsModal } from "../../components/OrderDetailsModal/OrderDetailsModal";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import CloseIcon from "../../assets/icons/close.svg?react";
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

function sortOrdersByDate(orders: Order[]) {
  return [...orders].sort((firstOrder, secondOrder) => {
    return (
      new Date(firstOrder.createdAt).getTime() -
      new Date(secondOrder.createdAt).getTime()
    );
  });
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

export function ProfilePage() {
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

  const sortedCurrentOrders = useMemo(() => {
    return sortOrdersByDate(currentOrders);
  }, [currentOrders]);

  const sortedHistoryOrders = useMemo(() => {
    return sortOrdersByDate(historyOrders);
  }, [historyOrders]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileOrders() {
      setOrdersError(null);
      setIsOrdersLoading(true);

      try {
        const profileOrders = await requestProfileOrders();

        if (isMounted) {
          setCurrentOrders(profileOrders.currentOrders);
          setHistoryOrders(profileOrders.historyOrders);
        }
      } catch {
        if (isMounted) {
          setCurrentOrders([]);
          setHistoryOrders([]);
          setOrdersError("Не получилось загрузить заказы");
        }
      } finally {
        if (isMounted) {
          setIsOrdersLoading(false);
        }
      }
    }

    loadProfileOrders();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleCancelOrderConfirm() {
    if (!orderToCancel) {
      return;
    }

    // Пока backend для отмены не написан, убираем заказ из актуальных только на фронте.
    // Позже здесь будет запрос отмены заказа на backend.
    setCurrentOrders((currentOrdersList) =>
      currentOrdersList.filter((order) => order.id !== orderToCancel.id),
    );
    setOrderToCancel(null);
    setSelectedOrder(null);
  }

  function handleEditOrderClick(order: Order) {
    // Позже здесь переключим пользователя на страницу редактирования заказа.
    console.log("Edit order", order.id);
  }

  return (
    <section className="profile-page">
      <header className="profile-header">
        <h1 className="profile-header__title">Профиль</h1>
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
        {isOrdersLoading && (
          <p className="profile-status">Загрузка текущих заказов...</p>
        )}

        {ordersError && (
          <p className="profile-status profile-status--error">{ordersError}</p>
        )}

        {!isOrdersLoading && !ordersError && sortedCurrentOrders.length > 0 && (
          <div className="profile-current-orders__list">
            {sortedCurrentOrders.map((order) => (
              <CurrentOrderCard
                order={order}
                key={order.id}
                onClick={setSelectedOrder}
              />
            ))}
          </div>
        )}
      </div>

      <button
        className="profile-orders-button"
        type="button"
        onClick={() => setIsHistoryVisible(true)}
      >
        История заказов
      </button>

      {isHistoryVisible && (
        <div className="profile-orders-modal">
          <button
            className="profile-orders-modal__backdrop"
            type="button"
            aria-label="Закрыть историю заказов"
            onClick={() => setIsHistoryVisible(false)}
          />

          <div
            className="profile-orders-modal__panel"
            role="dialog"
            aria-modal="true"
          >
            <header className="profile-orders-modal__header">
              <h2 className="profile-orders-modal__title">История заказов</h2>

              <button
                className="profile-orders-modal__close"
                type="button"
                aria-label="Закрыть"
                onClick={() => setIsHistoryVisible(false)}
              >
                <CloseIcon className="profile-orders-modal__close-icon" />
              </button>
            </header>

            <div className="profile-orders-modal__content">
              {isOrdersLoading && (
                <p className="profile-status">Загрузка истории заказов...</p>
              )}

              {ordersError && (
                <p className="profile-status profile-status--error">
                  {ordersError}
                </p>
              )}

              {!isOrdersLoading &&
                !ordersError &&
                sortedHistoryOrders.length === 0 && (
                  <div className="profile-empty">
                    <h2 className="profile-empty__title">
                      Истории заказов пока нет
                    </h2>
                  </div>
                )}

              {!isOrdersLoading && !ordersError && sortedHistoryOrders.length > 0 && (
                <div className="profile-orders__list">
                  {sortedHistoryOrders.map((order) => (
                    <OrderCard order={order} key={order.id} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onCancel={setOrderToCancel}
          onEdit={handleEditOrderClick}
        />
      )}

      {orderToCancel && (
        <CancelOrderConfirmModal
          onClose={() => setOrderToCancel(null)}
          onConfirm={handleCancelOrderConfirm}
        />
      )}
    </section>
  );
}
