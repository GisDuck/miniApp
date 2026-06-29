import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";

import { apiGet, apiSend } from "./api";
import arrowIcon from "./assets/arrow.svg";
import closeIcon from "./assets/close.svg";
import plusIcon from "./assets/plus.svg";
import type {
  AdminImage,
  AdminOrder,
  DeliverySettings,
  Category,
  OrderStatus,
  PickupAddress,
  ProductDetails,
  ProductListItem,
  ProductVariant,
} from "./types/admin";

const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "CREATED", label: "Оформлен" },
  { value: "PREPARING", label: "Готовится" },
  { value: "DELIVERING", label: "В доставке" },
  { value: "READY_FOR_PICKUP", label: "Ожидает получения" },
  { value: "COMPLETED", label: "Завершен" },
  { value: "CANCELED", label: "Отменен" },
];

const IMAGE_BASE_URL =
  import.meta.env.VITE_IMAGE_BASE_URL ?? "https://heartstore.tech";

type ProductFilters = {
  q: string;
  categoryId: string;
  active: string;
  stock: string;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function statusLabel(status: OrderStatus) {
  return ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

function pickupReservationStatusLabel(status: string) {
  if (status === "ADMIN_BLOCK") {
    return "Блок";
  }

  if (status === "CONFIRMED") {
    return "Заказ";
  }

  if (status === "PENDING") {
    return "Ожидает";
  }

  return status;
}

function pickupReservationDescription(status: string, moySkladOrderName: string | null) {
  if (status === "ADMIN_BLOCK") {
    return "Заблокировано админкой";
  }

  return moySkladOrderName ? `Заказ №${moySkladOrderName}` : "Заказ еще создается";
}

function isPaymentAvailable(
  settings: DeliverySettings | null,
  deliveryMethodCode: string,
  paymentMethodCode: string,
) {
  return Boolean(
    settings?.paymentAvailability.some(
      (item) =>
        item.deliveryMethodCode === deliveryMethodCode &&
        item.paymentMethodCode === paymentMethodCode,
    ),
  );
}

function getImageSrc(url: string | null, cacheVersion?: number) {
  if (!url) {
    return "";
  }

  const imageUrl = /^https?:\/\//i.test(url)
    ? url
    : `${IMAGE_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;

  if (cacheVersion === undefined) {
    return imageUrl;
  }

  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${cacheVersion}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeFromMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

function getTodayDateInputValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function createAddressForm(address?: PickupAddress) {
  return {
    id: address?.id ?? null,
    title: address?.title ?? "",
    address: address?.address ?? "",
    description: address?.description ?? "",
    isActive: address?.isActive ?? true,
    sortOrder: String(address?.sortOrder ?? 0),
    startTime: formatTimeFromMinutes(address?.startTimeMinutes ?? 600),
    endTime: formatTimeFromMinutes(address?.endTimeMinutes ?? 1200),
    slotStepMinutes: String(address?.slotStepMinutes ?? 30),
  };
}

function createPickupSlotBlockForm() {
  return {
    pickupAddressId: "",
    pickupDate: getTodayDateInputValue(),
    startTime: "10:00",
    endTime: "18:00",
  };
}

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"products" | "orders" | "delivery">("products");

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [productFilters, setProductFilters] = useState<ProductFilters>({
    q: "",
    categoryId: "",
    active: "",
    stock: "",
  });
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetails | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [dragVariantId, setDragVariantId] = useState<string | null>(null);
  const [imageCacheVersion, setImageCacheVersion] = useState(0);

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderFilters, setOrderFilters] = useState({
    q: "",
    status: "",
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [deliverySettings, setDeliverySettings] =
    useState<DeliverySettings | null>(null);
  const [addressForm, setAddressForm] = useState(createAddressForm());
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [pickupSlotBlockForm, setPickupSlotBlockForm] = useState(
    createPickupSlotBlockForm(),
  );

  const selectedVariant = useMemo(() => {
    return selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [selectedProduct, selectedVariantId]);

  const showError = useCallback((nextError: unknown) => {
    setMessage("");
    setError(nextError instanceof Error ? nextError.message : String(nextError));
  }, []);

  const showMessage = useCallback((nextMessage: string) => {
    setError("");
    setMessage(nextMessage);
  }, []);

  const loadCategories = useCallback(async () => {
    setCategories(await apiGet<Category[]>("/api/categories"));
  }, []);

  const loadProducts = useCallback(async () => {
    const params = new URLSearchParams();

    Object.entries(productFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    setProducts(await apiGet<ProductListItem[]>(`/api/products?${params.toString()}`));
  }, [productFilters]);

  const loadProduct = useCallback(async (productId: string) => {
    const product = await apiGet<ProductDetails>(`/api/products/${productId}`);
    setSelectedProduct(product);
    setSelectedVariantId((current) => {
      if (current && product.variants.some((variant) => variant.id === current)) {
        return current;
      }

      return product.variants[0]?.id ?? null;
    });
  }, []);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams();

    if (orderFilters.q) {
      params.set("q", orderFilters.q);
    }

    if (orderFilters.status) {
      params.set("status", orderFilters.status);
    }

    setOrders(await apiGet<AdminOrder[]>(`/api/orders?${params.toString()}`));
  }, [orderFilters]);

  const loadOrder = useCallback(async (orderId: string) => {
    setSelectedOrder(await apiGet<AdminOrder>(`/api/orders/${orderId}`));
  }, []);

  const loadDeliverySettings = useCallback(async () => {
    setDeliverySettings(await apiGet<DeliverySettings>("/api/delivery-settings"));
  }, []);

  useEffect(() => {
    apiGet<{ username: string }>("/api/me")
      .then((user) => setUsername(user.username))
      .catch(() => setUsername(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!username) {
      return;
    }

    loadCategories().catch(showError);
  }, [loadCategories, showError, username]);

  useEffect(() => {
    if (!username) {
      return;
    }

    loadProducts().catch(showError);
  }, [loadProducts, showError, username]);

  useEffect(() => {
    if (tab !== "orders" || !username) {
      return;
    }

    loadOrders().catch(showError);
  }, [loadOrders, showError, tab, username]);

  useEffect(() => {
    if (tab !== "delivery" || !username) {
      return;
    }

    loadDeliverySettings().catch(showError);
  }, [loadDeliverySettings, showError, tab, username]);

  useEffect(() => {
    if (selectedProductId) {
      loadProduct(selectedProductId).catch(showError);
    }
  }, [loadProduct, selectedProductId, showError]);

  useEffect(() => {
    if (selectedOrderId) {
      loadOrder(selectedOrderId).catch(showError);
    }
  }, [loadOrder, selectedOrderId, showError]);

  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [error, message]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    try {
      const result = await apiSend<{ username: string }>("/api/login", "POST", login);
      setUsername(result.username);
      showMessage("Вход выполнен");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function handleLogout() {
    try {
      await apiSend("/api/logout", "POST");
    } finally {
      setUsername(null);
      setSelectedProduct(null);
      setSelectedProductId(null);
      setSelectedVariantId(null);
      setSelectedOrder(null);
      setSelectedOrderId(null);
      setDeliverySettings(null);
      setAddressForm(createAddressForm());
      setMessage("");
      setError("");
    }
  }

  async function toggleDeliveryMethod(code: string, isActive: boolean) {
    try {
      const settings = await apiSend<DeliverySettings>(
        `/api/delivery-settings/methods/${code}`,
        "PATCH",
        {
          isActive,
        },
      );

      setDeliverySettings(settings);
      showMessage("Настройки доставки сохранены");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function togglePaymentMethod(code: string, isActive: boolean) {
    try {
      const settings = await apiSend<DeliverySettings>(
        `/api/delivery-settings/payment-methods/${code}`,
        "PATCH",
        {
          isActive,
        },
      );

      setDeliverySettings(settings);
      showMessage("Настройки оплаты сохранены");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function togglePaymentAvailability(
    deliveryMethodCode: string,
    paymentMethodCode: string,
    isAvailable: boolean,
  ) {
    try {
      const settings = await apiSend<DeliverySettings>(
        "/api/delivery-settings/payment-availability",
        "PATCH",
        {
          deliveryMethodCode,
          paymentMethodCode,
          isAvailable,
        },
      );

      setDeliverySettings(settings);
      showMessage("Доступность оплаты сохранена");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function savePickupAddress(event: FormEvent) {
    event.preventDefault();

    try {
      const payload = {
        title: addressForm.title,
        address: addressForm.address,
        description: addressForm.description,
        isActive: addressForm.isActive,
        sortOrder: Number(addressForm.sortOrder),
        startTimeMinutes: parseTimeToMinutes(addressForm.startTime),
        endTimeMinutes: parseTimeToMinutes(addressForm.endTime),
        slotStepMinutes: Number(addressForm.slotStepMinutes),
      };
      const settings = await apiSend<DeliverySettings>(
        addressForm.id
          ? `/api/delivery-settings/pickup-addresses/${addressForm.id}`
          : "/api/delivery-settings/pickup-addresses",
        addressForm.id ? "PATCH" : "POST",
        payload,
      );

      setDeliverySettings(settings);
      setAddressForm(createAddressForm());
      setIsAddressModalOpen(false);
      showMessage("Адрес самовывоза сохранен");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function deletePickupAddress(addressId: number) {
    try {
      const settings = await apiSend<DeliverySettings>(
        `/api/delivery-settings/pickup-addresses/${addressId}`,
        "DELETE",
      );

      setDeliverySettings(settings);
      if (addressForm.id === addressId) {
        setAddressForm(createAddressForm());
      }
      setIsAddressModalOpen(false);
      showMessage("Адрес самовывоза удален");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function blockPickupSlotRange(event: FormEvent) {
    event.preventDefault();

    try {
      const settings = await apiSend<DeliverySettings>(
        "/api/delivery-settings/pickup-slot-blocks",
        "POST",
        {
          pickupAddressId: Number(pickupSlotBlockForm.pickupAddressId),
          pickupDate: pickupSlotBlockForm.pickupDate,
          startTime: pickupSlotBlockForm.startTime,
          endTime: pickupSlotBlockForm.endTime,
        },
      );

      setDeliverySettings(settings);
      showMessage("Промежуток занят");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function uploadImageFiles(variant: ProductVariant, files: File[]) {
    const selectedFiles = files.filter((file) => file.size > 0);

    if (selectedFiles.length === 0) {
      showError(new Error("Выберите webp-файл"));
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) => file.type !== "image/webp" || !file.name.toLowerCase().endsWith(".webp"),
    );

    if (invalidFile) {
      showError(new Error("Можно загружать только webp"));
      return;
    }

    try {
      setUploadingVariantId(variant.id);

      for (const file of selectedFiles) {
        const form = new FormData();
        form.set("image", file);
        await apiSend<AdminImage>(`/api/images/${variant.id}/upload`, "POST", form);
      }

      if (selectedProduct) {
        await loadProduct(selectedProduct.id);
      }

      await loadProducts();
      setImageCacheVersion((current) => current + 1);
      showMessage(
        selectedFiles.length === 1
          ? "Картинка загружена"
          : `Загружено картинок: ${selectedFiles.length}`,
      );
    } catch (nextError) {
      showError(nextError);
    } finally {
      setUploadingVariantId(null);
      setDragVariantId(null);
    }
  }

  async function deleteImage(variant: ProductVariant, image: AdminImage) {
    if (!selectedProduct) {
      return;
    }

    try {
      await apiSend<AdminImage[]>(`/api/images/${variant.id}/${image.index}`, "DELETE");
      await loadProduct(selectedProduct.id);
      await loadProducts();
      setImageCacheVersion((current) => current + 1);
      showMessage("Картинка удалена");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function moveImage(variant: ProductVariant, fromIndex: number, toIndex: number) {
    if (!selectedProduct) {
      return;
    }

    try {
      await apiSend<AdminImage[]>(`/api/images/${variant.id}/reorder`, "PATCH", {
        fromIndex,
        toIndex,
      });
      await loadProduct(selectedProduct.id);
      await loadProducts();
      setImageCacheVersion((current) => current + 1);
    } catch (nextError) {
      showError(nextError);
    }
  }

  if (!authChecked) {
    return <div className="center-page">Загрузка...</div>;
  }

  if (!username) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Админка магазина</h1>
          <label>
            Логин
            <input
              value={login.username}
              onChange={(event) => setLogin({ ...login, username: event.target.value })}
              autoComplete="username"
            />
          </label>
          <label>
            Пароль
            <input
              value={login.password}
              onChange={(event) => setLogin({ ...login, password: event.target.value })}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">Войти</button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div>
          <strong>Shop Admin</strong>
          <span>{username}</span>
        </div>
        <nav>
          <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>
            Товары
          </button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
            Заказы
          </button>
          <button className={tab === "delivery" ? "active" : ""} onClick={() => setTab("delivery")}>
            Доставка
          </button>
          <button type="button" onClick={handleLogout}>
            Выйти
          </button>
        </nav>
      </header>

      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {tab === "products" ? (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel compact">
              <h2>Фильтры</h2>
              <input
                value={productFilters.q}
                onChange={(event) => setProductFilters({ ...productFilters, q: event.target.value })}
                placeholder="Название, код, категория"
              />
              <select
                value={productFilters.categoryId}
                onChange={(event) =>
                  setProductFilters({ ...productFilters, categoryId: event.target.value })
                }
              >
                <option value="">Все категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
              <select
                value={productFilters.stock}
                onChange={(event) => setProductFilters({ ...productFilters, stock: event.target.value })}
              >
                <option value="">Любой остаток</option>
                <option value="in">В наличии</option>
                <option value="out">Нет в наличии</option>
              </select>
              <button type="button" onClick={() => loadProducts().catch(showError)}>
                Обновить
              </button>
            </div>
            <div className="list">
              {products.map((product) => (
                <button
                  key={product.id}
                  className={product.id === selectedProductId ? "list-item selected" : "list-item"}
                  onClick={() => setSelectedProductId(product.id)}
                >
                  <span>{product.categoryTitle}</span>
                  <strong>{product.title}</strong>
                  <small>
                    {product.code} · вариантов: {product.variantsCount} · в наличии: {product.inStockCount}
                  </small>
                </button>
              ))}
            </div>
          </aside>

          <section className="content">
            {selectedProduct ? (
              <>
                <div className="panel">
                  <div className="panel-title">
                    <h2>{selectedProduct.title}</h2>
                    <span>{selectedProduct.isActive ? "Активен" : "Скрыт"}</span>
                  </div>
                  <div className="details-grid">
                    <span>UUID</span>
                    <strong>{selectedProduct.id}</strong>
                    <span>Код</span>
                    <strong>{selectedProduct.code}</strong>
                    <span>Категория</span>
                    <strong>{selectedProduct.categoryTitle}</strong>
                    <span>Описание</span>
                    <strong>{selectedProduct.description || "Нет"}</strong>
                  </div>
                </div>

                <div className="panel">
                  <h2>Варианты и картинки</h2>
                  <div className="variant-tabs">
                    {selectedProduct.variants.map((variant) => (
                      <button
                        key={variant.id}
                        className={variant.id === selectedVariantId ? "active" : ""}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        {variant.optionLabel} · {variant.maxQuantity} шт.
                      </button>
                    ))}
                  </div>
                </div>

                {selectedVariant ? (
                  <div
                    className={`panel image-panel${dragVariantId === selectedVariant.id ? " image-panel--drag-active" : ""}`}
                    onDragEnter={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault();
                      setDragVariantId(selectedVariant.id);
                    }}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault();
                      setDragVariantId(selectedVariant.id);
                    }}
                    onDragLeave={(event: DragEvent<HTMLDivElement>) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragVariantId(null);
                      }
                    }}
                    onDrop={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault();
                      void uploadImageFiles(selectedVariant, [...event.dataTransfer.files]);
                    }}
                  >
                    {dragVariantId === selectedVariant.id ? (
                      <div className="image-drop-target">
                        <img src={plusIcon} alt="" />
                      </div>
                    ) : null}
                    <div className="panel-title">
                      <h2>{selectedVariant.title}</h2>
                      <span>/img/{selectedVariant.id}/n.webp</span>
                    </div>
                    <div className="details-grid">
                      <span>UUID</span>
                      <strong>{selectedVariant.id}</strong>
                      <span>Код</span>
                      <strong>{selectedVariant.code}</strong>
                      <span>Цена</span>
                      <strong>{formatPrice(selectedVariant.price)} ₽</strong>
                      <span>Остаток</span>
                      <strong>{selectedVariant.maxQuantity}</strong>
                    </div>
                    <form
                      className="inline"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const input = form.elements.namedItem("image");

                        if (input instanceof HTMLInputElement && input.files) {
                          await uploadImageFiles(selectedVariant, [...input.files]);
                          form.reset();
                        }
                      }}
                    >
                      <input name="image" type="file" accept="image/webp,.webp" multiple />
                      <button type="submit" disabled={uploadingVariantId === selectedVariant.id}>
                        {uploadingVariantId === selectedVariant.id ? "Загрузка..." : "Загрузить webp"}
                      </button>
                    </form>
                    <div className="image-grid">
                      {selectedVariant.images.length > 0 ? (
                        selectedVariant.images.map((image, imageIndex) => (
                          <div className="image-card" key={image.id}>
                            <button
                              className="image-card__remove"
                              type="button"
                              onClick={() => void deleteImage(selectedVariant, image)}
                              aria-label="Удалить картинку"
                            >
                              <img src={closeIcon} alt="" />
                            </button>
                            <button
                              className="image-card__arrow image-card__arrow--left"
                              type="button"
                              disabled={imageIndex === 0}
                              onClick={() =>
                                void moveImage(selectedVariant, image.index, image.index - 1)
                              }
                              aria-label="Сдвинуть картинку влево"
                            >
                              <img src={arrowIcon} alt="" />
                            </button>
                            <img src={getImageSrc(image.url, imageCacheVersion)} alt="" />
                            <button
                              className="image-card__arrow image-card__arrow--right"
                              type="button"
                              disabled={imageIndex === selectedVariant.images.length - 1}
                              onClick={() =>
                                void moveImage(selectedVariant, image.index, image.index + 1)
                              }
                              aria-label="Сдвинуть картинку вправо"
                            >
                              <img src={arrowIcon} alt="" />
                            </button>
                            <code>{image.url}</code>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">Картинок для этого UUID пока нет.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state">Выберите товар слева.</div>
            )}
          </section>
        </section>
      ) : tab === "orders" ? (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel compact">
              <h2>Заказы</h2>
              <input
                value={orderFilters.q}
                onChange={(event) => setOrderFilters({ ...orderFilters, q: event.target.value })}
                placeholder="UUID, номер, клиент, телефон"
              />
              <select
                value={orderFilters.status}
                onChange={(event) => setOrderFilters({ ...orderFilters, status: event.target.value })}
              >
                <option value="">Все статусы</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => loadOrders().catch(showError)}>
                Обновить
              </button>
            </div>
            <div className="list">
              {orders.map((order) => (
                <button
                  key={order.id}
                  className={order.id === selectedOrderId ? "list-item selected" : "list-item"}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <span>№{order.name} · {statusLabel(order.status)}</span>
                  <strong>{order.customerName || "Без имени"}</strong>
                  <small>
                    {order.customerPhone} · {formatPrice(order.totalPrice)} ₽
                  </small>
                </button>
              ))}
            </div>
          </aside>

          <section className="content">
            {selectedOrder ? (
              <>
                <div className="panel">
                  <div className="panel-title">
                    <h2>Заказ №{selectedOrder.name}</h2>
                    <span>{selectedOrder.stateName ?? statusLabel(selectedOrder.status)}</span>
                  </div>
                  <div className="details-grid">
                    <span>UUID</span>
                    <strong>{selectedOrder.id}</strong>
                    <span>Клиент</span>
                    <strong>{selectedOrder.customerName || "Не указан"}</strong>
                    <span>Телефон</span>
                    <strong>{selectedOrder.customerPhone || "Не указан"}</strong>
                    <span>Адрес</span>
                    <strong>{selectedOrder.shipmentAddress || "Не указан"}</strong>
                    <span>Создан</span>
                    <strong>{formatDate(selectedOrder.createdAt)}</strong>
                    <span>Сумма</span>
                    <strong>{formatPrice(selectedOrder.totalPrice)} ₽</strong>
                  </div>
                </div>

                <div className="panel">
                  <h2>Состав заказа</h2>
                  <div className="order-items">
                    {selectedOrder.items.map((item) => (
                      <div className="order-item" key={item.id}>
                        {item.imageUrl ? (
                          <img src={getImageSrc(item.imageUrl, imageCacheVersion)} alt="" />
                        ) : (
                          <div className="image-placeholder">Фото</div>
                        )}
                        <div>
                          <strong>{item.title}</strong>
                          <span>
                            {item.quantity} x {formatPrice(item.price)} ₽ ={" "}
                            {formatPrice(item.totalPrice)} ₽
                          </span>
                          <small>{item.productVariantId ?? "UUID не найден"}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">Выберите заказ слева.</div>
            )}
          </section>
        </section>
      ) : (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel compact">
              <h2>Доставка</h2>
              <button type="button" onClick={() => loadDeliverySettings().catch(showError)}>
                Обновить
              </button>
            </div>

            <div className="panel compact">
              <h2>Способы</h2>
              {deliverySettings?.methods.map((method) => (
                <label className="checkbox" key={method.code}>
                  <input
                    type="checkbox"
                    checked={method.isActive}
                    onChange={(event) =>
                      void toggleDeliveryMethod(method.code, event.target.checked)
                    }
                  />
                  {method.title}
                </label>
              ))}
            </div>

            <div className="panel compact">
              <h2>Оплата</h2>
              {deliverySettings?.paymentMethods.map((method) => (
                <label className="checkbox" key={method.code}>
                  <input
                    type="checkbox"
                    checked={method.isActive}
                    onChange={(event) =>
                      void togglePaymentMethod(method.code, event.target.checked)
                    }
                  />
                  {method.title}
                </label>
              ))}
            </div>

            <div className="panel compact">
              <h2>Оплата по доставке</h2>
              {deliverySettings?.methods.map((deliveryMethod) => (
                <div className="delivery-payment-group" key={deliveryMethod.code}>
                  <strong>{deliveryMethod.title}</strong>
                  {deliverySettings.paymentMethods.map((paymentMethod) => (
                    <label
                      className="checkbox"
                      key={`${deliveryMethod.code}-${paymentMethod.code}`}
                    >
                      <input
                        type="checkbox"
                        checked={isPaymentAvailable(
                          deliverySettings,
                          deliveryMethod.code,
                          paymentMethod.code,
                        )}
                        onChange={(event) =>
                          void togglePaymentAvailability(
                            deliveryMethod.code,
                            paymentMethod.code,
                            event.target.checked,
                          )
                        }
                      />
                      {paymentMethod.title}
                    </label>
                  ))}
                </div>
              ))}
            </div>

          </aside>

          <section className="content">
            <div className="panel">
              <div className="panel-title">
                <h2>Адреса самовывоза</h2>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setAddressForm(createAddressForm());
                    setIsAddressModalOpen(true);
                  }}
                  aria-label="Добавить адрес самовывоза"
                >
                  <img src={plusIcon} alt="" />
                </button>
              </div>
              <div className="list">
                {deliverySettings?.pickupAddresses.length ? (
                  deliverySettings.pickupAddresses.map((address) => (
                    <button
                      className="list-item"
                      key={address.id}
                      type="button"
                      onClick={() => {
                        setAddressForm(createAddressForm(address));
                        setIsAddressModalOpen(true);
                      }}
                    >
                      <span>{address.isActive ? "Активен" : "Выключен"}</span>
                      <strong>{address.title}</strong>
                      <small>
                        {address.address} · {formatTimeFromMinutes(address.startTimeMinutes)}
                        -{formatTimeFromMinutes(address.endTimeMinutes)} · шаг{" "}
                        {address.slotStepMinutes} мин.
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">Добавьте первый адрес самовывоза.</div>
                )}
              </div>
            </div>

            <form className="panel" onSubmit={blockPickupSlotRange}>
              <h2>Занять время самовывоза</h2>

              <div className="form-grid">
                <label className="wide">
                  Склад
                  <select
                    value={pickupSlotBlockForm.pickupAddressId}
                    onChange={(event) =>
                      setPickupSlotBlockForm((current) => ({
                        ...current,
                        pickupAddressId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Выберите склад</option>
                    {deliverySettings?.pickupAddresses.map((address) => (
                      <option value={address.id} key={address.id}>
                        {address.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Дата
                  <input
                    type="date"
                    value={pickupSlotBlockForm.pickupDate}
                    onChange={(event) =>
                      setPickupSlotBlockForm((current) => ({
                        ...current,
                        pickupDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  С
                  <input
                    type="time"
                    step={1800}
                    value={pickupSlotBlockForm.startTime}
                    onChange={(event) =>
                      setPickupSlotBlockForm((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  До
                  <input
                    type="time"
                    step={1800}
                    value={pickupSlotBlockForm.endTime}
                    onChange={(event) =>
                      setPickupSlotBlockForm((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <button className="wide" type="submit">
                  Занять промежуток
                </button>
              </div>
            </form>

            <div className="panel">
              <h2>Занятые слоты</h2>
              <div className="order-items">
                {deliverySettings?.reservations.length ? (
                  deliverySettings.reservations.map((reservation) => (
                    <div className="order-item" key={reservation.id}>
                      <div className="image-placeholder">
                        {pickupReservationStatusLabel(reservation.status)}
                      </div>
                      <div>
                        <strong>{reservation.pickupAddressTitle}</strong>
                        <span>
                          {reservation.pickupDate} ·{" "}
                          {formatTimeFromMinutes(reservation.pickupTimeMinutes)}
                        </span>
                        <small>
                          {pickupReservationDescription(
                            reservation.status,
                            reservation.moySkladOrderName,
                          )}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Занятых слотов пока нет.</div>
                )}
              </div>
            </div>
          </section>
        </section>
      )}

      {isAddressModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={savePickupAddress}>
            <div className="panel-title">
              <h2>{addressForm.id ? "Адрес самовывоза" : "Новый адрес"}</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setAddressForm(createAddressForm());
                  setIsAddressModalOpen(false);
                }}
                aria-label="Закрыть"
              >
                <img src={closeIcon} alt="" />
              </button>
            </div>
            <label>
              Название
              <input
                value={addressForm.title}
                onChange={(event) =>
                  setAddressForm({ ...addressForm, title: event.target.value })
                }
              />
            </label>
            <label>
              Адрес
              <textarea
                value={addressForm.address}
                onChange={(event) =>
                  setAddressForm({ ...addressForm, address: event.target.value })
                }
              />
            </label>
            <label>
              Описание после заказа
              <textarea
                value={addressForm.description}
                onChange={(event) =>
                  setAddressForm({
                    ...addressForm,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={addressForm.isActive}
                onChange={(event) =>
                  setAddressForm({ ...addressForm, isActive: event.target.checked })
                }
              />
              Активен
            </label>
            <div className="grid-two">
              <label>
                С
                <input
                  type="time"
                  value={addressForm.startTime}
                  onChange={(event) =>
                    setAddressForm({ ...addressForm, startTime: event.target.value })
                  }
                />
              </label>
              <label>
                До
                <input
                  type="time"
                  value={addressForm.endTime}
                  onChange={(event) =>
                    setAddressForm({ ...addressForm, endTime: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="grid-two">
              <label>
                Шаг, минут
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={addressForm.slotStepMinutes}
                  onChange={(event) =>
                    setAddressForm({
                      ...addressForm,
                      slotStepMinutes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Порядок
                <input
                  type="number"
                  value={addressForm.sortOrder}
                  onChange={(event) =>
                    setAddressForm({ ...addressForm, sortOrder: event.target.value })
                  }
                />
              </label>
            </div>
            <button type="submit">Сохранить</button>
            {addressForm.id ? (
              <button
                type="button"
                onClick={() => void deletePickupAddress(addressForm.id as number)}
              >
                Удалить адрес
              </button>
            ) : null}
          </form>
        </div>
      ) : null}
    </main>
  );
}
