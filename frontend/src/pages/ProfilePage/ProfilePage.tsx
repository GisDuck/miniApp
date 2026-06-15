import { useMemo, useState } from "react";

import { OrderCard, type Order } from "../../components/OrderCard/OrderCard";
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
    id: 1,
    createdAt: "2026-06-10T10:00:00.000Z",
    items: [
      {
        id: 1,
        title: "DJI Osmo Pocket 3",
        quantity: 1,
        price: 58990,
      },
      {
        id: 2,
        title: "DJI Mic Mini",
        quantity: 2,
        price: 11990,
      },
    ],
    totalPrice: 82970,
  },
  {
    id: 2,
    createdAt: "2026-06-12T14:30:00.000Z",
    items: [
      {
        id: 3,
        title: "DJI RS 4 Mini",
        quantity: 1,
        price: 32990,
      },
    ],
    totalPrice: 32990,
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
  // Пока backend для истории заказов не написан, показываем мок-данные.
  // Когда добавим GET /orders, здесь заменим код на запрос через apiTGInitFetch.
  return MOCK_ORDERS;
}

export function ProfilePage() {
  const telegramUser = getTelegramUser();
  const userName = getTelegramUserName(telegramUser);
  const username = telegramUser?.username ? `@${telegramUser.username}` : null;
  const avatarUrl = telegramUser?.photo_url;

  const [isAvatarBroken, setIsAvatarBroken] = useState(false);
  const [isOrdersVisible, setIsOrdersVisible] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((firstOrder, secondOrder) => {
      return (
        new Date(firstOrder.createdAt).getTime() -
        new Date(secondOrder.createdAt).getTime()
      );
    });
  }, [orders]);

  async function handleOrdersButtonClick() {
    setIsOrdersVisible(true);

    if (orders.length > 0 || isOrdersLoading) {
      return;
    }

    setOrdersError(null);
    setIsOrdersLoading(true);

    try {
      const loadedOrders = await requestOrders();
      setOrders(loadedOrders);
    } catch {
      setOrders([]);
      setOrdersError("Не получилось загрузить историю заказов.");
    } finally {
      setIsOrdersLoading(false);
    }
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

      <button
        className="profile-orders-button"
        type="button"
        onClick={handleOrdersButtonClick}
      >
        История заказов
      </button>

      {isOrdersVisible && (
        <div className="profile-orders">
          {isOrdersLoading && (
            <p className="profile-status">Загрузка истории заказов...</p>
          )}

          {ordersError && (
            <p className="profile-status profile-status--error">{ordersError}</p>
          )}

          {!isOrdersLoading && !ordersError && sortedOrders.length === 0 && (
            <div className="profile-empty">
              <h2 className="profile-empty__title">Заказов пока нет</h2>
            </div>
          )}

          {!isOrdersLoading && !ordersError && sortedOrders.length > 0 && (
            <div className="profile-orders__list">
              {sortedOrders.map((order) => (
                <OrderCard order={order} key={order.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
