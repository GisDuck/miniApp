import {
  type FormEvent,
  type TouchEvent,
  type WheelEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import "./CheckoutPage.css";
import ArrowIcon from "../../assets/icons/arrow.svg?react";
import { apiTGInitFetch } from "../../shared/apiTGInitFetch";
import {
  isLargeScreen,
  isTelegramDesktop,
  isTelegramMobile,
} from "../../shared/telegram";

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
  address: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
  slotStepMinutes: number;
};

type DeliveryOptionsResponse = {
  methods: DeliveryMethod[];
  pickupAddresses: PickupAddress[];
};

const DEFAULT_DELIVERY_OPTIONS: DeliveryOptionsResponse = {
  methods: [
    { code: "pickup", title: "Самовывоз", isActive: true },
    { code: "cdek", title: "Доставка CDEK", isActive: false },
    {
      code: "yandex_express",
      title: "Экспресс доставка Яндекс",
      isActive: false,
    },
  ],
  pickupAddresses: [],
};

type PickupSlotsResponse = {
  pickupAddressId: number;
  dates: Array<{
    date: string;
    timeSlots: number[];
  }>;
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
      address: string;
      description: string | null;
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

type WheelOption = {
  value: string;
  label: string;
};

type WheelPickerProps = {
  options: WheelOption[];
  value: string;
  emptyText: string;
  onChange: (value: string) => void;
};

function WheelPicker({ options, value, emptyText, onChange }: WheelPickerProps) {
  const gestureRef = useRef<{
    startY: number;
    lastStepY: number;
  } | null>(null);
  const wheelDeltaRef = useRef(0);
  const isDesktop = isTelegramDesktop() || (!isTelegramMobile() && isLargeScreen());
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const visibleOptions = [
    options[selectedIndex - 2] ?? null,
    options[selectedIndex - 1] ?? null,
    options[selectedIndex] ?? null,
    options[selectedIndex + 1] ?? null,
    options[selectedIndex + 2] ?? null,
  ];

  function changeBy(direction: -1 | 1) {
    const nextOption = options[selectedIndex + direction];

    if (nextOption && nextOption.value !== value) {
      onChange(nextOption.value);
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();

    wheelDeltaRef.current += event.deltaY;

    if (Math.abs(wheelDeltaRef.current) < 80) {
      return;
    }

    changeBy(wheelDeltaRef.current > 0 ? 1 : -1);
    wheelDeltaRef.current = 0;
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];

    gestureRef.current = {
      startY: touch.clientY,
      lastStepY: touch.clientY,
    };
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    const touch = event.touches[0];

    if (!gesture) {
      return;
    }

    const deltaY = touch.clientY - gesture.lastStepY;
    const stepThreshold = 34;

    if (Math.abs(deltaY) < stepThreshold) {
      return;
    }

    event.preventDefault();
    changeBy(deltaY < 0 ? 1 : -1);
    gesture.lastStepY = touch.clientY;
  }

  function handleTouchEnd() {
    gestureRef.current = null;
  }

  if (options.length === 0) {
    if (!emptyText) {
      return null;
    }

    return <p className="checkout-section__muted">{emptyText}</p>;
  }

  return (
    <div
      className={
        isDesktop
          ? "checkout-wheel-shell checkout-wheel-shell--desktop"
          : "checkout-wheel-shell"
      }
    >
      {isDesktop && (
        <button
          className="checkout-wheel-arrow checkout-wheel-arrow--up"
          type="button"
          aria-label="Прокрутить вверх"
          onClick={() => changeBy(-1)}
        >
          <ArrowIcon aria-hidden="true" />
        </button>
      )}

      <div
        className="checkout-wheel"
        role="listbox"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {visibleOptions.map((option, index) => (
          <button
            className={
              !option
                ? "checkout-wheel__item checkout-wheel__item--placeholder"
                : index === 2
                ? "checkout-wheel__item checkout-wheel__item--active"
                : "checkout-wheel__item"
            }
            type="button"
            key={option?.value ?? `empty-${index}`}
            disabled={!option}
            onClick={() => {
              if (index < 2) {
                changeBy(-1);
              }

              if (index > 2) {
                changeBy(1);
              }
            }}
          >
            {option?.label ?? ""}
          </button>
        ))}
      </div>

      {isDesktop && (
        <button
          className="checkout-wheel-arrow checkout-wheel-arrow--down"
          type="button"
          aria-label="Прокрутить вниз"
          onClick={() => changeBy(1)}
        >
          <ArrowIcon aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

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

export function CheckoutPage({ onBack, onOrderCreated }: CheckoutPageProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryOptions, setDeliveryOptions] =
    useState<DeliveryOptionsResponse>(DEFAULT_DELIVERY_OPTIONS);
  const [pickupSlots, setPickupSlots] = useState<PickupSlotsResponse | null>(
    null,
  );
  const [selectedMethodCode, setSelectedMethodCode] = useState("");
  const [selectedPickupAddressId, setSelectedPickupAddressId] = useState<
    number | null
  >(null);
  const [selectedPickupDate, setSelectedPickupDate] = useState("");
  const [selectedPickupTime, setSelectedPickupTime] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [stockErrorModal, setStockErrorModal] =
    useState<StockErrorModal | null>(null);
  const [isDeliveryOptionsLoaded, setIsDeliveryOptionsLoaded] = useState(false);
  const [isLoadingDelivery, setIsLoadingDelivery] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadDeliveryOptionsOnce() {
    if (isDeliveryOptionsLoaded || isLoadingDelivery) {
      return;
    }

    setIsLoadingDelivery(true);

    try {
      const response = await apiTGInitFetch("/delivery-options");

      if (!response.ok) {
        throw new Error("Не получилось загрузить способы доставки");
      }

      const options = (await response.json()) as DeliveryOptionsResponse;

      setDeliveryOptions(options);
      setIsDeliveryOptionsLoaded(true);
    } finally {
      setIsLoadingDelivery(false);
    }
  }

  async function loadPickupSlots(pickupAddressId: number) {
    setIsLoadingSlots(true);

    try {
      const response = await apiTGInitFetch(
        `/delivery-options/pickup-slots?pickupAddressId=${pickupAddressId}`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data && typeof data.message === "string"
            ? data.message
            : "Не получилось загрузить время самовывоза",
        );
      }

      const slots = (await response.json()) as PickupSlotsResponse;
      const firstDate = slots.dates[0] ?? null;
      const firstTimeMinutes = firstDate?.timeSlots[0] ?? null;

      setPickupSlots(slots);
      setSelectedPickupDate(firstDate?.date ?? "");
      setSelectedPickupTime(
        firstTimeMinutes === null ? "" : formatMinutes(firstTimeMinutes),
      );
    } finally {
      setIsLoadingSlots(false);
    }
  }

  const selectedMethod =
    deliveryOptions.methods.find((method) => method.code === selectedMethodCode) ??
    null;
  const selectedPickupAddress =
    deliveryOptions.pickupAddresses.find(
      (address) => address.id === selectedPickupAddressId,
    ) ?? null;
  const selectedDateSlots =
    pickupSlots?.dates.find((date) => date.date === selectedPickupDate) ?? null;
  const dateOptions = useMemo(
    () =>
      pickupSlots?.dates.map((date) => ({
        value: date.date,
        label: formatPickupDate(date.date),
      })) ?? [],
    [pickupSlots],
  );
  const timeOptions = useMemo(
    () =>
      selectedDateSlots?.timeSlots.map((timeMinutes) => ({
        value: formatMinutes(timeMinutes),
        label: formatMinutes(timeMinutes),
      })) ?? [],
    [selectedDateSlots],
  );

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

      if (!selectedPickupTime) {
        return "Выберите время самовывоза";
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
            selectedMethodCode === "pickup" ? selectedPickupTime : undefined,
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

        if (stockError?.code === "PICKUP_SLOT_UNAVAILABLE" && selectedPickupAddressId) {
          await loadPickupSlots(selectedPickupAddressId);
          setSelectedPickupDate("");
          setSelectedPickupTime("");
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

              {createdOrder.delivery.pickupAddress?.description && (
                <p className="checkout-success__description">
                  {createdOrder.delivery.pickupAddress.description}
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
        <div>
          <h1 className="checkout-header__title">Оформление</h1>
          <p className="checkout-header__subtitle">
            Укажи контакты и выбери способ получения заказа.
          </p>
        </div>
      </header>

      {error && <p className="checkout-status checkout-status--error">{error}</p>}

      <form className="checkout-form" id="checkout-form" onSubmit={handleSubmit}>
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

          <div className="checkout-delivery-grid">
            {deliveryOptions.methods.map((method) => (
              <button
                className={
                  selectedMethodCode === method.code
                    ? "checkout-choice checkout-choice--active"
                    : "checkout-choice"
                }
                type="button"
                key={method.code}
                disabled={!method.isActive || isSubmitting || isLoadingDelivery}
                onClick={() => {
                  setError(null);
                  setSelectedMethodCode(method.code);
                  setSelectedPickupAddressId(null);
                  setSelectedPickupDate("");
                  setSelectedPickupTime("");
                  setPickupSlots(null);

                  if (method.code === "pickup") {
                    void loadDeliveryOptionsOnce().catch((error) => {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Не получилось загрузить способы доставки",
                      );
                    });
                  }
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

            {!isLoadingDelivery && isDeliveryOptionsLoaded && deliveryOptions.pickupAddresses.length ? (
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
                    disabled={isSubmitting || isLoadingSlots}
                    onClick={() => {
                      setSelectedPickupAddressId(address.id);
                      setSelectedPickupDate("");
                      setSelectedPickupTime("");
                      void loadPickupSlots(address.id).catch((error) => {
                        setError(
                          error instanceof Error
                            ? error.message
                            : "Не получилось загрузить время самовывоза",
                        );
                      });
                    }}
                  >
                    <strong>{address.address}</strong>
                  </button>
                ))}
              </div>
            ) : null}

            {!isLoadingDelivery && !isLoadingSlots && selectedPickupAddress && (
              <div className="checkout-pickup-wheel-row">
                <div className="checkout-pickup-wheel-column">
                  <h3 className="checkout-subtitle">День самовывоза</h3>
                  <WheelPicker
                    options={dateOptions}
                    value={selectedPickupDate}
                    emptyText="Свободных дней пока нет."
                    onChange={(value) => {
                      const nextDateSlots = pickupSlots?.dates.find(
                        (date) => date.date === value,
                      );
                      const firstTimeMinutes = nextDateSlots?.timeSlots[0] ?? null;

                      setSelectedPickupDate(value);
                      setSelectedPickupTime(
                        firstTimeMinutes === null
                          ? ""
                          : formatMinutes(firstTimeMinutes),
                      );
                    }}
                  />
                </div>

                <div className="checkout-pickup-wheel-column">
                  <h3 className="checkout-subtitle">Время самовывоза</h3>
                  <WheelPicker
                    options={timeOptions}
                    value={selectedPickupTime}
                    emptyText={
                      selectedPickupDate ? "Свободного времени нет." : ""
                    }
                    onChange={setSelectedPickupTime}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="checkout-submit-bar">
          <button
            className="checkout-submit-button"
            type="submit"
            disabled={isSubmitting || isLoadingDelivery || isLoadingSlots}
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
