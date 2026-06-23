import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiGet, apiSend } from "./api";
import type {
  AdminOrder,
  Category,
  OrderStatus,
  ProductDetails,
  ProductListItem,
  ProductVariant,
  VariantImage,
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
  import.meta.env.VITE_IMAGE_BASE_URL ?? "https://tgminiapp.heartstore.tech";

type ProductFilters = {
  q: string;
  categoryId: string;
  active: string;
  stock: string;
};

type VariantDraft = {
  moySkladId: string;
  optionLabel: string;
  title: string;
  description: string;
  price: string;
  maxQuantity: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyVariantDraft: VariantDraft = {
  moySkladId: "123123",
  optionLabel: "",
  title: "",
  description: "",
  price: "0",
  maxQuantity: "0",
  isActive: true,
  sortOrder: "",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function statusLabel(status: OrderStatus) {
  return ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

function toVariantDraft(variant: ProductVariant): VariantDraft {
  return {
    moySkladId: variant.moySkladId,
    optionLabel: variant.optionLabel,
    title: variant.title,
    description: variant.description ?? "",
    price: String(variant.price),
    maxQuantity: String(variant.maxQuantity),
    isActive: variant.isActive,
    sortOrder: String(variant.sortOrder),
  };
}

function toVariantPayload(draft: VariantDraft) {
  return {
    moySkladId: draft.moySkladId,
    optionLabel: draft.optionLabel,
    title: draft.title,
    description: draft.description,
    price: Number(draft.price),
    maxQuantity: Number(draft.maxQuantity),
    isActive: draft.isActive,
    sortOrder: draft.sortOrder === "" ? undefined : Number(draft.sortOrder),
  };
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

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [productFilters, setProductFilters] = useState<ProductFilters>({
    q: "",
    categoryId: "",
    active: "",
    stock: "",
  });
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetails | null>(null);
  const [productDraft, setProductDraft] = useState({
    categoryId: "",
    description: "",
    isActive: false,
  });
  const [newProductDraft, setNewProductDraft] = useState({
    categoryId: "",
    description: "",
    isActive: false,
  });

  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(emptyVariantDraft);
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);
  const [attachUrl, setAttachUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderFilters, setOrderFilters] = useState({
    q: "",
    status: "",
  });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [nextOrderStatus, setNextOrderStatus] = useState<OrderStatus>("CREATED");
  const [restoreStock, setRestoreStock] = useState(false);

  const selectedVariant = useMemo(() => {
    return selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [selectedProduct, selectedVariantId]);

  const sharedImageUrls = useMemo(() => {
    const urls = new Set<string>();

    selectedProduct?.variants.forEach((variant) => {
      variant.images.forEach((image) => urls.add(image.url));
    });

    return [...urls];
  }, [selectedProduct]);

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

  const loadProduct = useCallback(async (productId: number) => {
    const product = await apiGet<ProductDetails>(`/api/products/${productId}`);
    setSelectedProduct(product);
    setProductDraft({
      categoryId: String(product.categoryId),
      description: product.description,
      isActive: product.isActive,
    });

    const firstVariant = product.variants[0] ?? null;
    setSelectedVariantId((current) => {
      if (current && product.variants.some((variant) => variant.id === current)) {
        return current;
      }

      return firstVariant?.id ?? null;
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

  const loadOrder = useCallback(async (orderId: number) => {
    const order = await apiGet<AdminOrder>(`/api/orders/${orderId}`);
    setSelectedOrder(order);
    setNextOrderStatus(order.status);
    setRestoreStock(false);
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
    if (isCreatingVariant) {
      return;
    }

    if (selectedVariant) {
      setVariantDraft(toVariantDraft(selectedVariant));
    } else {
      setVariantDraft(emptyVariantDraft);
    }
  }, [isCreatingVariant, selectedVariant]);

  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2000);

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
      setIsCreatingVariant(false);
      setSelectedOrder(null);
      setSelectedOrderId(null);
      setMessage("");
      setError("");
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();

    try {
      await apiSend<Category>("/api/categories", "POST", {
        title: newCategoryTitle,
      });
      setNewCategoryTitle("");
      setCategoryModalOpen(false);
      await loadCategories();
      showMessage("Категория создана");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();

    try {
      const product = await apiSend<ProductDetails>("/api/products", "POST", {
        ...newProductDraft,
        categoryId: Number(newProductDraft.categoryId),
      });
      setNewProductDraft({ categoryId: "", description: "", isActive: false });
      setProductModalOpen(false);
      setSelectedProductId(product.id);
      await loadProducts();
      showMessage("Товар создан");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();

    if (!selectedProduct) {
      return;
    }

    try {
      const product = await apiSend<ProductDetails>(
        `/api/products/${selectedProduct.id}`,
        "PATCH",
        {
          ...productDraft,
          categoryId: Number(productDraft.categoryId),
        },
      );
      setSelectedProduct(product);
      await loadProducts();
      showMessage("Товар сохранен");
    } catch (nextError) {
      showError(nextError);
    }
  }

  function startNewVariant() {
    if (!selectedProduct) {
      return;
    }

    setIsCreatingVariant(true);
    setSelectedVariantId(null);
    setVariantDraft({
      ...emptyVariantDraft,
      sortOrder: String(selectedProduct.variants.length),
    });
  }

  async function createVariantFromDraft() {
    if (!selectedProduct) {
      return;
    }

    try {
      const variant = await apiSend<ProductVariant>(
        `/api/products/${selectedProduct.id}/variants`,
        "POST",
        toVariantPayload(variantDraft),
      );
      setIsCreatingVariant(false);
      setSelectedVariantId(variant.id);
      await loadProduct(selectedProduct.id);
      await loadProducts();
      showMessage("Вариант создан");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function saveVariant(event: FormEvent) {
    event.preventDefault();

    if (isCreatingVariant) {
      await createVariantFromDraft();
      return;
    }

    if (!selectedProduct || !selectedVariant) {
      return;
    }

    try {
      await apiSend<ProductVariant>(
        `/api/variants/${selectedVariant.id}`,
        "PATCH",
        toVariantPayload(variantDraft),
      );
      await loadProduct(selectedProduct.id);
      await loadProducts();
      showMessage("Вариант сохранен");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProduct || !selectedVariant) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("image");

    if (!(file instanceof File) || file.size === 0) {
      showError(new Error("Выберите webp-файл"));
      return;
    }

    if (file.type !== "image/webp" || !file.name.toLowerCase().endsWith(".webp")) {
      showError(new Error("Можно загружать только webp"));
      return;
    }

    try {
      setUploading(true);
      await apiSend<VariantImage>(
        `/api/variants/${selectedVariant.id}/images/upload`,
        "POST",
        form,
      );
      formElement.reset();
      await loadProduct(selectedProduct.id);
      showMessage("Картинка загружена");
    } catch (nextError) {
      showError(nextError);
    } finally {
      setUploading(false);
    }
  }

  async function attachImage(event: FormEvent) {
    event.preventDefault();

    if (!selectedProduct || !selectedVariant) {
      return;
    }

    try {
      await apiSend<VariantImage>(
        `/api/variants/${selectedVariant.id}/images/attach`,
        "POST",
        {
          url: attachUrl,
        },
      );
      setAttachUrl("");
      await loadProduct(selectedProduct.id);
      showMessage("Картинка назначена варианту");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function reorderImages(imageIds: number[]) {
    if (!selectedProduct || !selectedVariant) {
      return;
    }

    try {
      await apiSend<VariantImage[]>(
        `/api/variants/${selectedVariant.id}/images/reorder`,
        "PATCH",
        { imageIds },
      );
      await loadProduct(selectedProduct.id);
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function deleteImage(imageId: number) {
    if (!selectedProduct) {
      return;
    }

    try {
      await apiSend(`/api/variant-images/${imageId}`, "DELETE");
      await loadProduct(selectedProduct.id);
      showMessage("Картинка убрана у варианта");
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function updateOrderStatus(event: FormEvent) {
    event.preventDefault();

    if (!selectedOrder) {
      return;
    }

    try {
      const order = await apiSend<AdminOrder>(
        `/api/orders/${selectedOrder.id}/status`,
        "PATCH",
        {
          status: nextOrderStatus,
          restoreStock,
        },
      );
      setSelectedOrder(order);
      await loadOrders();
      showMessage("Статус заказа обновлен");
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

  const imageIds = selectedVariant?.images.map((image) => image.id) ?? [];

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
          <button type="button" onClick={handleLogout}>Выйти</button>
        </nav>
      </header>

      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {tab === "products" ? (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel compact">
              <div className="panel-title">
                <h2>Категории</h2>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  aria-label="Создать категорию"
                >
                  +
                </button>
              </div>
            </div>

            <div className="panel compact">
              <div className="panel-title">
                <h2>Товары</h2>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setProductModalOpen(true)}
                  aria-label="Создать товар"
                >
                  +
                </button>
              </div>
              <input
                value={productFilters.q}
                onChange={(event) =>
                  setProductFilters({ ...productFilters, q: event.target.value })
                }
                placeholder="Поиск"
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
              <div className="inline">
                <select
                  value={productFilters.active}
                  onChange={(event) =>
                    setProductFilters({ ...productFilters, active: event.target.value })
                  }
                >
                  <option value="">Любая активность</option>
                  <option value="true">Активные</option>
                  <option value="false">Выключенные</option>
                </select>
                <select
                  value={productFilters.stock}
                  onChange={(event) =>
                    setProductFilters({ ...productFilters, stock: event.target.value })
                  }
                >
                  <option value="">Любой остаток</option>
                  <option value="in">В наличии</option>
                  <option value="out">Нет в наличии</option>
                </select>
              </div>
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
                  <div className="product-list-row">
                    {product.previewImageUrl ? (
                      <img src={getImageSrc(product.previewImageUrl)} alt="" />
                    ) : (
                      <span className="product-list-row__placeholder">Фото</span>
                    )}
                    <span>
                      <span>#{product.id} {product.categoryTitle}</span>
                      <strong>{product.firstVariantTitle ?? product.description}</strong>
                      <small>
                        Лайков: {product.likesCount} · Вариантов: {product.variantsCount} · Остаток:
                        {" "}
                        {product.inStockCount}
                      </small>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="content">
            {selectedProduct ? (
              <>
                <form className="panel" onSubmit={saveProduct}>
                  <div className="panel-title">
                    <h2>Товар #{selectedProduct.id}</h2>
                    <span>Лайков: {selectedProduct.likesCount}</span>
                  </div>
                  <select
                    value={productDraft.categoryId}
                    onChange={(event) =>
                      setProductDraft({ ...productDraft, categoryId: event.target.value })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={productDraft.description}
                    onChange={(event) =>
                      setProductDraft({ ...productDraft, description: event.target.value })
                    }
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={productDraft.isActive}
                      onChange={(event) =>
                        setProductDraft({ ...productDraft, isActive: event.target.checked })
                      }
                    />
                    Активен на витрине
                  </label>
                  <button type="submit">Сохранить товар</button>
                </form>

                <div className="panel">
                  <div className="panel-title">
                    <h2>Варианты</h2>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={startNewVariant}
                      aria-label="Добавить вариант"
                    >
                      +
                    </button>
                  </div>
                  <div className="variant-tabs">
                    {selectedProduct.variants.map((variant) => (
                      <button
                        key={variant.id}
                        className={variant.id === selectedVariantId ? "active" : ""}
                        onClick={() => {
                          setIsCreatingVariant(false);
                          setSelectedVariantId(variant.id);
                        }}
                      >
                        {variant.optionLabel} · {variant.maxQuantity} шт.
                      </button>
                    ))}
                    {isCreatingVariant ? (
                      <button className="active" type="button">
                        Новый вариант
                      </button>
                    ) : null}
                  </div>
                </div>

                <form className="panel" onSubmit={saveVariant}>
                  <h2>
                    {isCreatingVariant
                      ? "Новый вариант"
                      : selectedVariant
                        ? `Вариант #${selectedVariant.id}`
                        : "Вариант"}
                  </h2>
                  <VariantFields draft={variantDraft} onChange={setVariantDraft} />
                  <button type="submit" disabled={!selectedVariant && !isCreatingVariant}>
                    {isCreatingVariant ? "Создать вариант" : "Сохранить вариант"}
                  </button>
                </form>

                {selectedVariant && !isCreatingVariant ? (
                  <div className="panel">
                    <div className="panel-title">
                      <h2>Картинки варианта</h2>
                      <span>/img/{selectedProduct.id}/{selectedVariant.id}/n.webp</span>
                    </div>
                    <form className="inline" onSubmit={uploadImage}>
                      <input name="image" type="file" accept="image/webp,.webp" />
                      <button type="submit" disabled={uploading}>
                        {uploading ? "Загрузка..." : "Загрузить webp"}
                      </button>
                    </form>
                    <form className="inline" onSubmit={attachImage}>
                      <select value={attachUrl} onChange={(event) => setAttachUrl(event.target.value)}>
                        <option value="">Выбрать уже загруженную картинку</option>
                        {sharedImageUrls.map((url) => (
                          <option key={url} value={url}>
                            {url}
                          </option>
                        ))}
                      </select>
                      <input
                        value={attachUrl}
                        onChange={(event) => setAttachUrl(event.target.value)}
                        placeholder="Любой путь к картинке"
                      />
                      <button type="submit">Назначить</button>
                    </form>
                    <div className="image-grid">
                      {selectedVariant.images.map((image, index) => (
                        <div className="image-card" key={image.id}>
                          <img src={getImageSrc(image.url)} alt="" />
                          <code>{image.url}</code>
                          <div className="image-actions">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...imageIds];
                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                reorderImages(next);
                              }}
                            >
                              Влево
                            </button>
                            <button type="button" onClick={() => deleteImage(image.id)}>
                              Убрать
                            </button>
                            <button
                              type="button"
                              disabled={index === imageIds.length - 1}
                              onClick={() => {
                                const next = [...imageIds];
                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                reorderImages(next);
                              }}
                            >
                              Вправо
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state">Выберите товар слева или создайте новый.</div>
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
                placeholder="id, имя, телефон, username"
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
                  <span>#{order.id} · {statusLabel(order.status)}</span>
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
                    <h2>Заказ #{selectedOrder.id}</h2>
                    <span>{statusLabel(selectedOrder.status)}</span>
                  </div>
                  <div className="details-grid">
                    <span>Клиент</span>
                    <strong>{selectedOrder.customerName || "Не указан"}</strong>
                    <span>Телефон</span>
                    <strong>{selectedOrder.customerPhone || "Не указан"}</strong>
                    <span>Telegram</span>
                    <strong>
                      {selectedOrder.telegramUser?.username
                        ? `@${selectedOrder.telegramUser.username}`
                        : selectedOrder.telegramUser?.telegramId ?? "Нет"}
                    </strong>
                    <span>Сумма</span>
                    <strong>{formatPrice(selectedOrder.totalPrice)} ₽</strong>
                  </div>
                </div>

                <form className="panel" onSubmit={updateOrderStatus}>
                  <h2>Статус</h2>
                  <select
                    value={nextOrderStatus}
                    onChange={(event) => setNextOrderStatus(event.target.value as OrderStatus)}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  {nextOrderStatus === "CANCELED" && selectedOrder.status !== "CANCELED" ? (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={restoreStock}
                        onChange={(event) => setRestoreStock(event.target.checked)}
                      />
                      Вернуть остатки на склад
                    </label>
                  ) : null}
                  <button type="submit">Обновить статус</button>
                </form>

                <div className="panel">
                  <h2>Состав заказа</h2>
                  <div className="order-items">
                    {selectedOrder.items.map((item) => (
                      <div className="order-item" key={item.id}>
                        {item.currentVariant?.imageUrl ? (
                          <img src={getImageSrc(item.currentVariant.imageUrl)} alt="" />
                        ) : (
                          <div className="image-placeholder">Фото</div>
                        )}
                        <div>
                          <strong>{item.title}</strong>
                          <span>
                            {item.quantity} × {formatPrice(item.price)} ₽ ={" "}
                            {formatPrice(item.totalPrice)} ₽
                          </span>
                          <small>
                            Сейчас:{" "}
                            {item.currentVariant
                              ? `${item.currentVariant.optionLabel}, остаток ${item.currentVariant.maxQuantity}`
                              : "вариант удален"}
                          </small>
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

      {categoryModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={createCategory}>
            <div className="panel-title">
              <h2>Новая категория</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <input
              value={newCategoryTitle}
              onChange={(event) => setNewCategoryTitle(event.target.value)}
              placeholder="Название категории"
              autoFocus
            />
            <button type="submit">Создать категорию</button>
          </form>
        </div>
      ) : null}

      {productModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={createProduct}>
            <div className="panel-title">
              <h2>Новый товар</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <select
              value={newProductDraft.categoryId}
              onChange={(event) =>
                setNewProductDraft({ ...newProductDraft, categoryId: event.target.value })
              }
            >
              <option value="">Категория</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title}
                </option>
              ))}
            </select>
            <textarea
              value={newProductDraft.description}
              onChange={(event) =>
                setNewProductDraft({ ...newProductDraft, description: event.target.value })
              }
              placeholder="Описание товара"
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={newProductDraft.isActive}
                onChange={(event) =>
                  setNewProductDraft({ ...newProductDraft, isActive: event.target.checked })
                }
              />
              Активен
            </label>
            <button type="submit">Создать товар</button>
          </form>
        </div>
      ) : null}

    </main>
  );
}

function VariantFields({
  draft,
  onChange,
}: {
  draft: VariantDraft;
  onChange: (draft: VariantDraft) => void;
}) {
  return (
    <div className="form-grid">
      <label>
        moySkladId
        <input
          value={draft.moySkladId}
          onChange={(event) => onChange({ ...draft, moySkladId: event.target.value })}
        />
      </label>
      <label>
        Название варианта
        <input
          value={draft.optionLabel}
          onChange={(event) => onChange({ ...draft, optionLabel: event.target.value })}
        />
      </label>
      <label>
        Заголовок
        <input
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label>
        Цена
        <input
          value={draft.price}
          onChange={(event) => onChange({ ...draft, price: event.target.value })}
          inputMode="numeric"
        />
      </label>
      <label>
        Количество
        <input
          value={draft.maxQuantity}
          onChange={(event) => onChange({ ...draft, maxQuantity: event.target.value })}
          inputMode="numeric"
        />
      </label>
      <label>
        Порядок
        <input
          value={draft.sortOrder}
          onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })}
          inputMode="numeric"
        />
      </label>
      <label className="wide">
        Описание варианта
        <textarea
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
      </label>
      <label className="checkbox wide">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => onChange({ ...draft, isActive: event.target.checked })}
        />
        Активен
      </label>
    </div>
  );
}
