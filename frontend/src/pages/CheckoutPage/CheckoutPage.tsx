import { type FormEvent, useState } from "react";

import "./CheckoutPage.css";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type CheckoutPageProps = {
  onBack: () => void;
  onOrderCreated: () => void;
};

type CreatedOrderResponse = {
  id: number;
  status: string;
  totalPrice: number | string;
  customerName: string;
  customerPhone: string;
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
      onOrderCreated();
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
    </section>
  );
}