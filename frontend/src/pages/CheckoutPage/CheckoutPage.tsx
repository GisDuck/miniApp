import {
  type FormEvent,
  type UIEvent,
  useEffect,
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
import type { Order } from "../../components/OrderCard/OrderCard";

type CheckoutPageProps = {
  onBack: () => void;
  onOrderCreated?: (remainingCartCount: number) => void;
  editOrder?: Order | null;
  onOrderUpdated?: (order: Order) => void;
};

type DeliveryMethod = {
  code: string;
  title: string;
  isActive: boolean;
};

type PaymentMethod = {
  code: string;
  title: string;
  isActive: boolean;
};

type PaymentAvailability = {
  deliveryMethodCode: string;
  paymentMethodCode: string;
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
  paymentMethods: PaymentMethod[];
  paymentAvailability: PaymentAvailability[];
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
  paymentMethods: [
    { code: "cash", title: "Наличные", isActive: true },
    { code: "card", title: "Карта", isActive: true },
  ],
  paymentAvailability: [
    { deliveryMethodCode: "pickup", paymentMethodCode: "cash" },
    { deliveryMethodCode: "pickup", paymentMethodCode: "card" },
    { deliveryMethodCode: "cdek", paymentMethodCode: "card" },
    { deliveryMethodCode: "yandex_express", paymentMethodCode: "card" },
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

type ProfileContactResponse = {
  customerName?: string;
  customerPhone?: string;
};

type CreatedOrderResponse = {
  id: string;
  name?: string;
  status: string;
  totalPrice: number | string;
  customerName: string;
  customerPhone: string;
  deliveryType?: string | null;
  comment?: string | null;
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
  payment?: {
    methodCode: string;
    methodTitle: string;
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
  const wheelRef = useRef<HTMLDivElement>(null);
  const scrollSelectedValueRef = useRef<string | null>(null);
  const isDesktop = isTelegramDesktop() || (!isTelegramMobile() && isLargeScreen());
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );

  useEffect(() => {
    const wheel = wheelRef.current;

    if (!wheel || options.length === 0) {
      return;
    }

    if (scrollSelectedValueRef.current === value) {
      scrollSelectedValueRef.current = null;
      return;
    }

    const step = getWheelStep(wheel);

    if (Math.abs(wheel.scrollTop - selectedIndex * step) > 1) {
      wheel.scrollTo({
        top: selectedIndex * step,
        behavior: "auto",
      });
    }
  }, [options, selectedIndex]);

  function getWheelStep(wheel: HTMLDivElement) {
    const items = wheel.querySelectorAll<HTMLButtonElement>(".checkout-wheel__item");

    if (items.length > 1) {
      return items[1].offsetTop - items[0].offsetTop;
    }

    return items[0]?.offsetHeight ?? 56;
  }

  function handleWheelScroll(event: UIEvent<HTMLDivElement>) {
    const wheel = event.currentTarget;

    if (options.length <= 1) {
      return;
    }

    const step = getWheelStep(wheel);
    const nextIndex = Math.round(wheel.scrollTop / step);
    const normalizedIndex = Math.min(Math.max(nextIndex, 0), options.length - 1);
    const nextOption = options[normalizedIndex];

    if (nextOption && nextOption.value !== value) {
      scrollSelectedValueRef.current = nextOption.value;
      onChange(nextOption.value);
    }
  }

  function handleWheelArrowClick(direction: -1 | 1) {
    const wheel = wheelRef.current;
    const nextIndex = Math.min(
      Math.max(selectedIndex + direction, 0),
      options.length - 1,
    );

    if (!wheel || nextIndex === selectedIndex) {
      return;
    }

    wheel.scrollTo({
      top: getWheelStep(wheel) * nextIndex,
      behavior: "smooth",
    });
    scrollSelectedValueRef.current = options[nextIndex].value;
    onChange(options[nextIndex].value);
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
          disabled={selectedIndex === 0}
          onClick={() => handleWheelArrowClick(-1)}
        >
          <ArrowIcon aria-hidden="true" />
        </button>
      )}

      <div
        className="checkout-wheel"
        role="listbox"
        ref={wheelRef}
        onScroll={handleWheelScroll}
      >
        {options.map((option, index) => (
          <button
            className={
              value === option.value
                ? "checkout-wheel__item checkout-wheel__item--active"
                : "checkout-wheel__item"
            }
            type="button"
            key={option.value}
            onClick={() => {
              const wheel = wheelRef.current;

              if (!wheel) {
                return;
              }

              wheel.scrollTo({
                top: getWheelStep(wheel) * index,
                behavior: "smooth",
              });
              scrollSelectedValueRef.current = option.value;
              onChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isDesktop && (
        <button
          className="checkout-wheel-arrow checkout-wheel-arrow--down"
          type="button"
          aria-label="Прокрутить вниз"
          disabled={selectedIndex === options.length - 1}
          onClick={() => handleWheelArrowClick(1)}
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

function parseTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function getDeliveryMethodCodeFromOrder(order: Order) {
  if (order.deliveryMethodCode) {
    return order.deliveryMethodCode;
  }

  const deliveryType = order.deliveryType?.toLowerCase() ?? "";

  if (
    deliveryType.includes("самовывоз") ||
    deliveryType.includes("СЃР°РјРѕРІС‹РІРѕР·")
  ) {
    return "pickup";
  }

  if (
    deliveryType.includes("cdek") ||
    deliveryType.includes("сдек") ||
    deliveryType.includes("СЃРґРµРє")
  ) {
    return "cdek";
  }

  if (
    deliveryType.includes("яндекс") ||
    deliveryType.includes("СЏРЅРґРµРєСЃ")
  ) {
    return "yandex_express";
  }

  return "";
}

function mergePreferredSlot(
  slots: PickupSlotsResponse,
  preferredDate?: string,
  preferredTime?: string,
) {
  const preferredTimeMinutes =
    preferredTime === undefined ? null : parseTimeToMinutes(preferredTime);

  if (!preferredDate || preferredTimeMinutes === null) {
    return slots;
  }

  const dateIndex = slots.dates.findIndex((date) => date.date === preferredDate);

  if (dateIndex === -1) {
    return {
      ...slots,
      dates: [
        ...slots.dates,
        {
          date: preferredDate,
          timeSlots: [preferredTimeMinutes],
        },
      ].sort((firstDate, secondDate) =>
        firstDate.date.localeCompare(secondDate.date),
      ),
    };
  }

  const targetDate = slots.dates[dateIndex];

  if (targetDate.timeSlots.includes(preferredTimeMinutes)) {
    return slots;
  }

  return {
    ...slots,
    dates: slots.dates.map((date, index) =>
      index === dateIndex
        ? {
            ...date,
            timeSlots: [...date.timeSlots, preferredTimeMinutes].sort(
              (firstTime, secondTime) => firstTime - secondTime,
            ),
          }
        : date,
    ),
  };
}

export function CheckoutPage({
  onBack,
  onOrderCreated,
  editOrder = null,
  onOrderUpdated,
}: CheckoutPageProps) {
  const isEditMode = Boolean(editOrder);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryOptions, setDeliveryOptions] =
    useState<DeliveryOptionsResponse>(DEFAULT_DELIVERY_OPTIONS);
  const [pickupSlots, setPickupSlots] = useState<PickupSlotsResponse | null>(
    null,
  );
  const [selectedMethodCode, setSelectedMethodCode] = useState("");
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState("");
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
  const [isContactLoaded, setIsContactLoaded] = useState(false);
  const [isLoadingDelivery, setIsLoadingDelivery] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!editOrder) {
      return;
    }

    const methodCode = getDeliveryMethodCodeFromOrder(editOrder);

    setCustomerName(editOrder.customerName ?? "");
    setCustomerPhone(editOrder.customerPhone ?? "");
    setSelectedMethodCode(methodCode);
    setSelectedPaymentMethodCode("");
    setCreatedOrder(null);
    setError(null);

    if (methodCode === "pickup" && editOrder.pickupReservation) {
      setSelectedPickupAddressId(editOrder.pickupReservation.pickupAddressId);
      setSelectedPickupDate(editOrder.pickupReservation.pickupDate);
      setSelectedPickupTime(editOrder.pickupReservation.pickupTime);
    } else {
      setSelectedPickupAddressId(null);
      setSelectedPickupDate("");
      setSelectedPickupTime("");
      setPickupSlots(null);
    }

    void loadDeliveryOptionsOnce().catch((error) => {
      setError(
        error instanceof Error
          ? error.message
          : "Не получилось загрузить способы доставки",
      );
    });
  }, [editOrder?.id]);

  useEffect(() => {
    if (editOrder || isContactLoaded) {
      return;
    }

    let isActual = true;

    async function loadProfileContact() {
      try {
        const response = await apiTGInitFetch("/profile/contact");

        if (!response.ok) {
          return;
        }

        const contact = (await response.json()) as ProfileContactResponse;

        if (!isActual) {
          return;
        }

        setCustomerName((currentName) =>
          currentName ? currentName : contact.customerName ?? "",
        );
        setCustomerPhone((currentPhone) =>
          currentPhone ? currentPhone : contact.customerPhone ?? "",
        );
      } finally {
        if (isActual) {
          setIsContactLoaded(true);
        }
      }
    }

    void loadProfileContact();

    return () => {
      isActual = false;
    };
  }, [editOrder, isContactLoaded]);

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

  async function loadPickupSlots(
    pickupAddressId: number,
    preferredDate?: string,
    preferredTime?: string,
  ) {
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

      const slotsFromApi = (await response.json()) as PickupSlotsResponse;
      const slots = mergePreferredSlot(slotsFromApi, preferredDate, preferredTime);
      const preferredDateSlots = preferredDate
        ? slots.dates.find((date) => date.date === preferredDate)
        : null;
      const firstDate = preferredDateSlots ?? slots.dates[0] ?? null;
      const preferredTimeMinutes =
        preferredTime === undefined ? null : parseTimeToMinutes(preferredTime);
      const firstTimeMinutes = firstDate?.timeSlots[0] ?? null;

      setPickupSlots(slots);
      setSelectedPickupDate(firstDate?.date ?? "");
      setSelectedPickupTime(
        preferredTimeMinutes !== null &&
          firstDate?.timeSlots.includes(preferredTimeMinutes)
          ? (preferredTime ?? "")
          : firstTimeMinutes === null
            ? ""
            : formatMinutes(firstTimeMinutes),
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
  const availablePaymentMethods = useMemo(() => {
    if (!selectedMethod) {
      return [];
    }

    const availablePaymentCodes = new Set(
      deliveryOptions.paymentAvailability
        .filter((item) => item.deliveryMethodCode === selectedMethod.code)
        .map((item) => item.paymentMethodCode),
    );

    return deliveryOptions.paymentMethods.filter((method) =>
      availablePaymentCodes.has(method.code),
    );
  }, [deliveryOptions, selectedMethod]);
  const selectedPaymentMethod =
    availablePaymentMethods.find(
      (method) => method.code === selectedPaymentMethodCode,
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

  useEffect(() => {
    if (
      !editOrder?.pickupReservation ||
      !isDeliveryOptionsLoaded ||
      pickupSlots ||
      isLoadingSlots
    ) {
      return;
    }

    void loadPickupSlots(
      editOrder.pickupReservation.pickupAddressId,
      editOrder.pickupReservation.pickupDate,
      editOrder.pickupReservation.pickupTime,
    ).catch((error) => {
      setError(
        error instanceof Error
          ? error.message
          : "Не получилось загрузить время самовывоза",
      );
    });
  }, [
    editOrder?.id,
    isDeliveryOptionsLoaded,
    pickupSlots,
    isLoadingSlots,
  ]);

  useEffect(() => {
    if (
      selectedPaymentMethodCode &&
      (!selectedPaymentMethod || !selectedPaymentMethod.isActive)
    ) {
      setSelectedPaymentMethodCode("");
    }
  }, [selectedPaymentMethod, selectedPaymentMethodCode]);

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

    if (
      !isEditMode &&
      (!selectedPaymentMethod || !selectedPaymentMethod.isActive)
    ) {
      return "Выберите доступный способ оплаты";
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
      const response = await apiTGInitFetch(
        isEditMode && editOrder ? `/profile/orders/${editOrder.id}` : "/orders",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName: trimmedName,
            customerPhone: trimmedPhone,
            deliveryMethodCode: selectedMethodCode,
            paymentMethodCode: isEditMode ? undefined : selectedPaymentMethodCode,
            pickupAddressId:
              selectedMethodCode === "pickup" ? selectedPickupAddressId : undefined,
            pickupDate:
              selectedMethodCode === "pickup" ? selectedPickupDate : undefined,
            pickupTime:
              selectedMethodCode === "pickup" ? selectedPickupTime : undefined,
          }),
        },
      );

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
      if (isEditMode) {
        onOrderUpdated?.(data as Order);
      } else {
        setCustomerName("");
        setCustomerPhone("");
        onOrderCreated?.(order.remainingCartCount ?? 0);
      }
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
            <h1 className="checkout-header__title">
              {isEditMode ? "Изменения сохранены" : "Заказ отправлен"}
            </h1>
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

          {createdOrder.deliveryType && (
            <p className="checkout-success__text">
              Способ доставки: {createdOrder.deliveryType}
            </p>
          )}

          {createdOrder.comment && (
            <p className="checkout-success__description">
              {createdOrder.comment}
            </p>
          )}

          {createdOrder.payment && (
            <p className="checkout-success__text">
              Способ оплаты: {createdOrder.payment.methodTitle}
            </p>
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
          <h1 className="checkout-header__title">
            {isEditMode ? "Редактирование заказа" : "Оформление"}
          </h1>
          <p className="checkout-header__subtitle">
            {isEditMode
              ? "Можно изменить контакты и способ получения. Состав заказа останется прежним."
              : "Укажите контакты и выберите способ получения заказа и оплаты."}
          </p>
        </div>
      </header>

      {error && <p className="checkout-status checkout-status--error">{error}</p>}

      <form className="checkout-form" id="checkout-form" onSubmit={handleSubmit}>
        {isEditMode && editOrder && (
          <section className="checkout-section checkout-order-preview">
            <h2 className="checkout-section__title">
              Заказ №{editOrder.name ?? editOrder.id}
            </h2>

            <div className="checkout-order-preview__items">
              {editOrder.items.map((item) => (
                <div className="checkout-order-preview__item" key={item.id}>
                  <span>{item.title}</span>
                  <strong>
                    {item.quantity} × {formatPrice(item.price)}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

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

          <div
            className="checkout-delivery-grid"
            onPointerDown={() => {
              void loadDeliveryOptionsOnce().catch((error) => {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Не получилось загрузить способы доставки",
                );
              });
            }}
          >
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
                  setSelectedPaymentMethodCode("");
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
                {!method.isActive ? <span>Пока недоступно</span>: ""}
              </button>
            ))}
          </div>
        </section>

        {!isEditMode && selectedMethod && (
          <section className="checkout-section">
            <h2 className="checkout-section__title">Способ оплаты</h2>

            <div className="checkout-delivery-grid">
              {availablePaymentMethods.map((method) => (
                <button
                  className={
                    selectedPaymentMethodCode === method.code
                      ? "checkout-choice checkout-choice--active"
                      : "checkout-choice"
                  }
                  type="button"
                  key={method.code}
                  disabled={!method.isActive || isSubmitting}
                  onClick={() => {
                    setError(null);
                    setSelectedPaymentMethodCode(method.code);
                  }}
                >
                  <strong>{method.title}</strong>
                  {!method.isActive ? <span>Пока недоступно</span>: ""}
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedMethod?.code === "pickup" && (
          <section className="checkout-section checkout-pickup-section">
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
                      const preferredReservation =
                        editOrder?.pickupReservation?.pickupAddressId === address.id
                          ? editOrder.pickupReservation
                          : null;

                      setSelectedPickupAddressId(address.id);
                      setSelectedPickupDate(preferredReservation?.pickupDate ?? "");
                      setSelectedPickupTime(preferredReservation?.pickupTime ?? "");
                      void loadPickupSlots(
                        address.id,
                        preferredReservation?.pickupDate,
                        preferredReservation?.pickupTime,
                      ).catch((error) => {
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

            {selectedPickupAddress && (
              <div className="checkout-pickup-schedule">
                {!isLoadingDelivery && !isLoadingSlots && (
                  <div className="checkout-pickup-wheel-row">
                    <div className="checkout-pickup-wheel-column">
                      <h3 className="checkout-subtitle">День</h3>
                      <WheelPicker
                        options={dateOptions}
                        value={selectedPickupDate}
                        emptyText="Свободных дней пока нет."
                        onChange={(value) => {
                          const nextDateSlots = pickupSlots?.dates.find(
                            (date) => date.date === value,
                          );
                          const firstTimeMinutes =
                            nextDateSlots?.timeSlots[0] ?? null;

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
                      <h3 className="checkout-subtitle">Время</h3>
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
            {isSubmitting
              ? isEditMode
                ? "Сохраняем..."
                : "Отправляем..."
              : isEditMode
                ? "Сохранить изменения"
                : "Отправить заказ"}
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
