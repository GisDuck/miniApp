import { type FormEvent, useEffect, useMemo, useState } from "react";

import "./CheckoutPage.css";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";

type CheckoutPageProps = {
  onBack: () => void;
  onOrderCreated: (remainingCartCount: number) => void;
};

type DeliveryMethod = {
  code: string;
  title: string;
  isActive: boolean;
};

type PickupAddress = {
  id: number;
  title: string;
  address: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
  slotStepMinutes: number;
};

type PickupReservation = {
  pickupAddressId: number;
  pickupDate: string;
  pickupTimeMinutes: number;
};

type DeliveryOptionsResponse = {
  methods: DeliveryMethod[];
  pickupAddresses: PickupAddress[];
  pickupDates: string[];
  pickupReservations: PickupReservation[];
};

type CreatedOrderResponse = {
  id: string;
  name?: string;
  status: string;
  totalPrice: number | string;
  customerName: string;
  customerPhone: string;
  delivery?: {
    methodCode: string;
    methodTitle: string;
    pickupAddress: {
      id: number;
      title: string;
      address: string;
    } | null;
    pickupDate: string | null;
    pickupTime: string | null;
  };
  remainingCartCount?: number;
};

type StockErrorItem = {
  productVariantId: string;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
};

type StockErrorResponse = {
  code?: "OUT_OF_STOCK" | "QUANTITY_EXCEEDED" | "PICKUP_SLOT_UNAVAILABLE";
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

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}

function formatPickupDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function createTimeSlots(address: PickupAddress | null) {
  if (!address) {
    return [];
  }

  const slots: number[] = [];

  for (
    let minutes = address.startTimeMinutes;
    minutes < address.endTimeMinutes;
    minutes += address.slotStepMinutes
  ) {
    slots.push(minutes);
  }

  return slots;
}

export function CheckoutPage({ onBack, onOrderCreated }: CheckoutPageProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryOptions, setDeliveryOptions] =
    useState<DeliveryOptionsResponse | null>(null);
  const [selectedMethodCode, setSelectedMethodCode] = useState("");
  const [selectedPickupAddressId, setSelectedPickupAddressId] = useState<
    number | null
  >(null);
  const [selectedPickupDate, setSelectedPickupDate] = useState("");
  const [selectedPickupTime, setSelectedPickupTime] = useState<number | null>(
    null,
  );
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [stockErrorModal, setStockErrorModal] =
    useState<StockErrorModal | null>(null);
  const [isLoadingDelivery, setIsLoadingDelivery] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadDeliveryOptions(signal?: AbortSignal) {
    setIsLoadingDelivery(true);

    try {
      const response = await apiTGInitFetch("/delivery-options", {
        signal,
      });

      if (!response.ok) {
        throw new Error("Не получилось загрузить способы доставки");
      }

      const options = (await response.json()) as DeliveryOptionsResponse;
      const nextMethod =
        options.methods.find((method) => method.code === "pickup" && method.isActive) ??
        options.methods.find((method) => method.isActive) ??
        options.methods[0];

      setDeliveryOptions(options);
      setSelectedMethodCode((current) => current || nextMethod?.code || "");
      setSelectedPickupAddressId((current) => {
        if (
          current &&
          options.pickupAddresses.some((address) => address.id === current)
        ) {
          return current;
        }

        return options.pickupAddresses[0]?.id ?? null;
      });
      setSelectedPickupDate((current) => current || options.pickupDates[0] || "");
    } finally {
      setIsLoadingDelivery(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    loadDeliveryOptions(controller.signal).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setError(
        error instanceof Error
          ? error.message
          : "Не получилось загрузить способы доставки",
      );
    });

    return () => {
      controller.abort();
    };
  }, []);

  const selectedMethod =
    deliveryOptions?.methods.find((method) => method.code === selectedMethodCode) ??
    null;
  const selectedPickupAddress =
    deliveryOptions?.pickupAddresses.find(
      (address) => address.id === selectedPickupAddressId,
    ) ?? null;
  const pickupTimeSlots = useMemo(
    () => createTimeSlots(selectedPickupAddress),
    [selectedPickupAddress],
  );
  const occupiedPickupSlots = useMemo(() => {
    return new Set(
      deliveryOptions?.pickupReservations.map(
        (reservation) =>
          `${reservation.pickupAddressId}:${reservation.pickupDate}:${reservation.pickupTimeMinutes}`,
      ) ?? [],
    );
  }, [deliveryOptions]);

  function isPickupTimeOccupied(timeMinutes: number) {
    return occupiedPickupSlots.has(
      `${selectedPickupAddressId}:${selectedPickupDate}:${timeMinutes}`,
    );
  }

  function validateForm() {
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (!trimmedName) {
      return "Введите имя";
    }

    if (!trimmedPhone) {
      return "Введите номер телефона";
    }

    if (!selectedMethod || !selectedMethod.isActive) {
      return "Выберите доступный способ доставки";
    }

    if (selectedMethod.code === "pickup") {
      if (!selectedPickupAddress) {
        return "Выберите адрес самовывоза";
      }

      if (!selectedPickupDate) {
        return "Выберите день самовывоза";
      }

      if (selectedPickupTime === null) {
        return "Выберите время самовывоза";
      }

      if (isPickupTimeOccupied(selectedPickupTime)) {
        return "Это время уже занято";
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

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
          deliveryMethodCode: selectedMethodCode,
          pickupAddressId:
            selectedMethodCode === "pickup" ? selectedPickupAddressId : undefined,
          pickupDate: selectedMethodCode === "pickup" ? selectedPickupDate : undefined,
          pickupTime:
            selectedMethodCode === "pickup" && selectedPickupTime !== null
              ? formatMinutes(selectedPickupTime)
              : undefined,
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

        if (stockError?.code === "PICKUP_SLOT_UNAVAILABLE") {
          await loadDeliveryOptions();
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
            Заказ №{createdOrder.name ?? createdOrder.id}
          </h2>

          <p className="checkout-success__text">
            Имя: {createdOrder.customerName}
          </p>

          <p className="checkout-success__text">
            Телефон: {createdOrder.customerPhone}
          </p>

          {createdOrder.delivery && (
            <>
              <p className="checkout-success__text">
                Способ доставки: {createdOrder.delivery.methodTitle}
              </p>

              {createdOrder.delivery.pickupAddress && (
                <p className="checkout-success__text">
                  Самовывоз: {createdOrder.delivery.pickupAddress.address}
                </p>
              )}

              {createdOrder.delivery.pickupDate && createdOrder.delivery.pickupTime && (
                <p className="checkout-success__text">
                  Время: {createdOrder.delivery.pickupDate},{" "}
                  {createdOrder.delivery.pickupTime}
                </p>
              )}
            </>
          )}

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
            Укажи контакты и выбери способ получения заказа.
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

        <section className="checkout-section">
          <h2 className="checkout-section__title">Способ доставки</h2>

          {isLoadingDelivery && (
            <p className="checkout-section__muted">Загружаем способы доставки...</p>
          )}

          <div className="checkout-delivery-grid">
            {deliveryOptions?.methods.map((method) => (
              <button
                className={
                  selectedMethodCode === method.code
                    ? "checkout-choice checkout-choice--active"
                    : "checkout-choice"
                }
                type="button"
                key={method.code}
                disabled={!method.isActive || isSubmitting}
                onClick={() => {
                  setSelectedMethodCode(method.code);
                  setSelectedPickupTime(null);
                }}
              >
                <strong>{method.title}</strong>
                <span>{method.isActive ? "Доступно" : "Пока недоступно"}</span>
              </button>
            ))}
          </div>
        </section>

        {selectedMethod?.code === "pickup" && (
          <section className="checkout-section">
            <h2 className="checkout-section__title">Самовывоз</h2>

            {deliveryOptions?.pickupAddresses.length ? (
              <div className="checkout-address-list">
                {deliveryOptions.pickupAddresses.map((address) => (
                  <button
                    className={
                      selectedPickupAddressId === address.id
                        ? "checkout-address checkout-address--active"
                        : "checkout-address"
                    }
                    type="button"
                    key={address.id}
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedPickupAddressId(address.id);
                      setSelectedPickupTime(null);
                    }}
                  >
                    <strong>{address.title}</strong>
                    <span>{address.address}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="checkout-section__muted">
                Адреса самовывоза пока не настроены.
              </p>
            )}

            {selectedPickupAddress && (
              <>
                <h3 className="checkout-subtitle">День самовывоза</h3>
                <div className="checkout-date-grid">
                  {deliveryOptions?.pickupDates.map((date) => (
                    <button
                      className={
                        selectedPickupDate === date
                          ? "checkout-date checkout-date--active"
                          : "checkout-date"
                      }
                      type="button"
                      key={date}
                      disabled={isSubmitting}
                      onClick={() => {
                        setSelectedPickupDate(date);
                        setSelectedPickupTime(null);
                      }}
                    >
                      {formatPickupDate(date)}
                    </button>
                  ))}
                </div>

                <h3 className="checkout-subtitle">Время самовывоза</h3>
                <div className="checkout-time-grid">
                  {pickupTimeSlots.map((timeMinutes) => {
                    const isOccupied = isPickupTimeOccupied(timeMinutes);

                    return (
                      <button
                        className={
                          selectedPickupTime === timeMinutes
                            ? "checkout-time checkout-time--active"
                            : "checkout-time"
                        }
                        type="button"
                        key={timeMinutes}
                        disabled={isSubmitting || isOccupied}
                        onClick={() => setSelectedPickupTime(timeMinutes)}
                      >
                        {formatMinutes(timeMinutes)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        <footer className="checkout-submit-bar">
          <button
            className="checkout-submit-button"
            type="submit"
            disabled={isSubmitting || isLoadingDelivery}
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

            <p className="checkout-stock-modal__text">{stockErrorModal.text}</p>

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
