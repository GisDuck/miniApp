import { useEffect, useMemo, useState } from "react";

import { CurrentOrderCard } from "../../components/CurrentOrderCard/CurrentOrderCard";
import { CancelOrderConfirmModal } from "../../components/CancelOrderConfirmModal/CancelOrderConfirmModal";
import { OrderCard, type Order } from "../../components/OrderCard/OrderCard";
import { OrderDetailsModal } from "../../components/OrderDetailsModal/OrderDetailsModal";
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

const MOCK_ORDERS: Order[] = [
  {
    id: 102456456,
    createdAt: "2026-06-12T14:30:00.000Z",
    status: "waiting_pickup",
    items: [
      {
        id: 3,
        title: "DJI RS 4 Mini",
        quantity: 1,
        price: 32990,
      },
      {
        id: 4,
        title: "DJI Goggles 3",
        quantity: 1,
        price: 49990,
      },
      {
        id: 5,
        title: "DJI Mic 2",
        quantity: 1,
        price: 21990,
      },
      {
        id: 6,
        title: "DJI Osmo Action 5 Pro",
        quantity: 1,
        price: 39990,
      },
      {
        id: 7,
        title: "DJI Osmo Action 5 Pro",
        quantity: 1,
        price: 39990,
      },
    ],
    totalPrice: 144960,
  },
  {
    id: 103,
    createdAt: "2026-06-13T12:20:00.000Z",
    status: "in_delivery",
    items: [
      {
        id: 7,
        title: "DJI Mini 4 Pro",
        quantity: 1,
        price: 89990,
      },
    ],
    totalPrice: 89990,
  },
];

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

async function requestOrders() {
  // Пока backend для заказов не написан, показываем мок-данные.
  // Когда добавим GET /orders, здесь заменим код на запрос через apiTGInitFetch.
  return MOCK_ORDERS;
}

export function ProfilePage() {
  const telegramUser = getTelegramUser();
  const userName = getTelegramUserName(telegramUser);
  const username = telegramUser?.username ? `@${telegramUser.username}` : null;
  const avatarUrl = telegramUser?.photo_url;

  const [isAvatarBroken, setIsAvatarBroken] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((firstOrder, secondOrder) => {
      return (
        new Date(firstOrder.createdAt).getTime() -
        new Date(secondOrder.createdAt).getTime()
      );
    });
  }, [orders]);

  const currentOrders = useMemo(() => {
    return sortedOrders.filter((order) => order.status !== "received");
  }, [sortedOrders]);

  const historyOrders = useMemo(() => {
    return sortedOrders.filter((order) => order.status === "received");
  }, [sortedOrders]);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      setOrdersError(null);
      setIsOrdersLoading(true);

      try {
        const loadedOrders = await requestOrders();

        if (isMounted) {
          setOrders(loadedOrders);
        }
      } catch {
        if (isMounted) {
          setOrders([]);
          setOrdersError("Не получилось загрузить заказы.");
        }
      } finally {
        if (isMounted) {
          setIsOrdersLoading(false);
        }
      }
    }

    loadOrders();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleCancelOrderConfirm() {
    if (!orderToCancel) {
      return;
    }

    // Пока backend не написан, убираем заказ из списка только на фронте.
    // Позже здесь будет запрос отмены заказа на backend.
    setOrders((currentOrdersList) =>
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

        {!isOrdersLoading && !ordersError && currentOrders.length > 0 && (
          <div className="profile-current-orders__list">
            {currentOrders.map((order) => (
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

              {!isOrdersLoading && !ordersError && historyOrders.length === 0 && (
                <div className="profile-empty">
                  <h2 className="profile-empty__title">Истории заказов пока нет</h2>
                </div>
              )}

              {!isOrdersLoading && !ordersError && historyOrders.length > 0 && (
                <div className="profile-orders__list">
                  {historyOrders.map((order) => (
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
