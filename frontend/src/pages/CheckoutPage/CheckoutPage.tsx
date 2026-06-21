import { type FormEvent, useState } from "react";

import "./CheckoutPage.css";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type CheckoutPageProps = {
  onBack: () => void;
  onOrderCreated: (remainingCartCount: number) => void;
};

type CreatedOrderResponse = {
  id: number;
  status: string;
  totalPrice: number | string;
  customerName: string;
  customerPhone: string;
  remainingCartCount?: number;
};

type StockErrorItem = {
  productVariantId: number;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
};

type StockErrorResponse = {
  code?: "OUT_OF_STOCK" | "QUANTITY_EXCEEDED";
  message?: string;
  items?: StockErrorItem[];
};

type StockErrorModal = {
  title: string;
  text: string;
  items: StockErrorItem[];
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

export function CheckoutPage({ onBack, onOrderCreated }: CheckoutPageProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [stockErrorModal, setStockErrorModal] =
    useState<StockErrorModal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (!trimmedName) {
      setError("Введите имя");
      return;
    }

    if (!trimmedPhone) {
      setError("Введите номер телефона");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await apiTGInitFetch("/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: trimmedName,
          customerPhone: trimmedPhone,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const stockError = data as StockErrorResponse | null;

        if (
          stockError?.code === "QUANTITY_EXCEEDED" ||
          stockError?.code === "OUT_OF_STOCK"
        ) {
          setStockErrorModal({
            title:
              stockError.code === "QUANTITY_EXCEEDED"
                ? "Нужно обновить количество"
                : "Некоторые товары закончились",
            text:
              stockError.code === "QUANTITY_EXCEEDED"
                ? "К сожалению, некоторых товаров нет в нужном количестве. Проверьте доступное количество в корзине, отредактируйте заказ и оформите его заново."
                : "К сожалению, некоторые товары уже закончились. Проверьте корзину, отредактируйте заказ и оформите его заново.",
            items: stockError.items ?? [],
          });
          return;
        }

        const message =
          data && typeof data.message === "string"
            ? data.message
            : "Не получилось отправить заказ";

        throw new Error(message);
      }

      const order = data as CreatedOrderResponse;

      setCreatedOrder(order);
      setCustomerName("");
      setCustomerPhone("");
      onOrderCreated(order.remainingCartCount ?? 0);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Не получилось отправить заказ");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdOrder) {
    return (
      <section className="checkout-page">
        <header className="checkout-header">
          <button className="checkout-back" type="button" onClick={onBack}>
            Назад
          </button>

          <div>
            <h1 className="checkout-header__title">Заказ отправлен</h1>
          </div>
        </header>

        <div className="checkout-success">
          <h2 className="checkout-success__title">
            Заказ №{createdOrder.id}
          </h2>

          <p className="checkout-success__text">
            Имя: {createdOrder.customerName}
          </p>

          <p className="checkout-success__text">
            Телефон: {createdOrder.customerPhone}
          </p>

          <p className="checkout-success__price">
            {formatPrice(Number(createdOrder.totalPrice))}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <header className="checkout-header">
        <button className="checkout-back" type="button" onClick={onBack}>
          Назад
        </button>

        <div>
          <h1 className="checkout-header__title">Оформление</h1>
          <p className="checkout-header__subtitle">
            Укажи имя и номер телефона для связи.
          </p>
        </div>
      </header>

      {error && <p className="checkout-status checkout-status--error">{error}</p>}

      <form className="checkout-form" onSubmit={handleSubmit}>
        <label className="checkout-field">
          <span className="checkout-field__label">Имя</span>

          <input
            className="checkout-input"
            type="text"
            value={customerName}
            placeholder="Например, Иван"
            autoComplete="name"
            disabled={isSubmitting}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </label>

        <label className="checkout-field">
          <span className="checkout-field__label">Номер телефона</span>

          <input
            className="checkout-input"
            type="tel"
            value={customerPhone}
            placeholder="+7 999 123-45-67"
            autoComplete="tel"
            disabled={isSubmitting}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
        </label>

        <footer className="checkout-submit-bar">
          <button
            className="checkout-submit-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Отправляем..." : "Отправить заказ"}
          </button>
        </footer>
      </form>

      {stockErrorModal && (
        <div className="checkout-stock-modal" role="dialog" aria-modal="true">
          <div className="checkout-stock-modal__panel">
            <h2 className="checkout-stock-modal__title">
              {stockErrorModal.title}
            </h2>

            <p className="checkout-stock-modal__text">
              {stockErrorModal.text}
            </p>

            {stockErrorModal.items.length > 0 && (
              <ul className="checkout-stock-modal__list">
                {stockErrorModal.items.map((item) => (
                  <li
                    className="checkout-stock-modal__item"
                    key={item.productVariantId}
                  >
                    <span>{item.title}</span>
                    <strong>Доступно: {item.availableQuantity}</strong>
                  </li>
                ))}
              </ul>
            )}

            <button
              className="checkout-stock-modal__button"
              type="button"
              onClick={() => {
                setStockErrorModal(null);
                onBack();
              }}
            >
              Вернуться в корзину
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
