import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";

import { apiGet, apiSend } from "./api";
import plusIcon from "./assets/plus.svg";
import type {
  AdminImage,
  AdminOrder,
  Category,
  OrderStatus,
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

function getImageSrc(url: string | null) {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${IMAGE_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
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

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"products" | "orders">("products");

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

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderFilters, setOrderFilters] = useState({
    q: "",
    status: "",
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

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
      setMessage("");
      setError("");
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
                        selectedVariant.images.map((image) => (
                          <div className="image-card" key={image.id}>
                            <img src={getImageSrc(image.url)} alt="" />
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
      ) : (
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
                          <img src={getImageSrc(item.imageUrl)} alt="" />
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
      )}
    </main>
  );
}
