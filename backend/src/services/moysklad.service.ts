import type { MoySkladMeta } from "../types/catalog.types";

const MOYSKLAD_BASE_URL =
  process.env.MOYSKLAD_BASE_URL ?? "https://api.moysklad.ru/api/remap/1.2";

type MoySkladListResponse<T> = {
  rows: T[];
  meta: {
    size?: number;
    limit?: number;
    offset?: number;
  };
};

export type MoySkladAssortmentRow = {
  id: string;
  meta: MoySkladMeta;
  name: string;
  code?: string;
  description?: string;
  archived?: boolean;
  pathName?: string;
  productFolder?: {
    meta: MoySkladMeta;
  };
  product?: {
    meta: MoySkladMeta;
  };
  characteristics?: Array<{
    name?: string;
    value?: string;
  }>;
  attributes?: Array<{
    name?: string;
    value?: unknown;
  }>;
  salePrices?: Array<{
    value?: number;
    priceType?: {
      name?: string;
      id?: string;
    };
  }>;
  variantsCount?: number;
  stock?: number;
  quantity?: number;
};

export type MoySkladProductFolder = {
  id: string;
  meta: MoySkladMeta;
  name: string;
  archived?: boolean;
  pathName?: string;
};

export type MoySkladCounterparty = {
  id: string;
  meta: MoySkladMeta;
  name: string;
  phone?: string;
  attributes?: Array<{
    meta: MoySkladMeta;
    value?: unknown;
  }>;
};

export type MoySkladOrderPosition = {
  id?: string;
  quantity?: number;
  price?: number;
  assortment?: MoySkladAssortmentRow & {
    meta: MoySkladMeta;
  };
};

type MoySkladPositionsList = {
  rows?: MoySkladOrderPosition[];
};

type MoySkladAttributeMetadata = {
  id: string;
  meta: MoySkladMeta;
  name: string;
  type?: string;
};

type MoySkladCustomerOrderState = {
  id: string;
  meta: MoySkladMeta;
  name: string;
};

type MoySkladCustomerOrderMetadata = {
  states?:
    | MoySkladCustomerOrderState[]
    | {
        rows?: MoySkladCustomerOrderState[];
      };
};

export type MoySkladAvailableStock = {
  assortmentId: string;
  availableQuantity: number;
};

type MoySkladShortStockRow = {
  assortmentId: string;
  quantity?: number;
};

export type MoySkladCustomerOrder = {
  id: string;
  name: string;
  meta: MoySkladMeta;
  created?: string;
  updated?: string;
  moment?: string;
  deliveryPlannedMoment?: string;
  description?: string;
  sum?: number;
  payedSum?: number;
  shippedSum?: number;
  shipmentAddress?: string;
  agent?: {
    id?: string;
    name?: string;
    phone?: string;
    meta?: MoySkladMeta;
  };
  state?: {
    meta?: MoySkladMeta;
    name?: string;
  };
  attributes?: Array<{
    meta?: MoySkladMeta;
    name?: string;
    value?: unknown;
  }>;
  positions?: {
    meta?: MoySkladMeta;
    rows?: MoySkladOrderPosition[];
  };
};

const WEBHOOK_DOCUMENT_ENTITY_BY_TYPE: Record<string, string> = {
  CustomerOrder: "customerorder",
  InvoiceOut: "invoiceout",
  InvoiceIn: "invoicein",
  PurchaseOrder: "purchaseorder",
  Demand: "demand",
  Supply: "supply",
  ProductionTask: "productiontask",
  PaymentIn: "paymentin",
  PaymentOut: "paymentout",
  CashIn: "cashin",
  CashOut: "cashout",
  SalesReturn: "salesreturn",
  Move: "move",
  PurchaseReturn: "purchasereturn",
  Company: "counterparty",
};

let counterpartyTelegramIdAttributeMeta: MoySkladMeta | null | undefined;
let customerOrderStates: MoySkladCustomerOrderState[] | null = null;
let customerOrderAttributeMetadata: MoySkladAttributeMetadata[] | null = null;
const customerOrderAttributeMetaByName = new Map<string, MoySkladMeta | null>();
const DEFAULT_CUSTOMER_ORDER_DELIVERY_TYPE_ATTRIBUTE_HREF =
  "https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/1b8090e7-7331-11f1-0a80-13570022d7d4";

export class MoySkladRequestError extends Error {
  statusCode: number;
  path: string;
  responseBody: string;

  constructor(input: {
    path: string;
    statusCode: number;
    responseBody: string;
    message: string;
  }) {
    super(input.message);
    this.name = "MoySkladRequestError";
    this.path = input.path;
    this.statusCode = input.statusCode;
    this.responseBody = input.responseBody;
  }
}

function getMoySkladToken() {
  const token = process.env.MOYSKLAD_TOKEN;

  if (!token) {
    throw new Error("MOYSKLAD_TOKEN is not configured");
  }

  return token;
}

function getJsonHeaders() {
  return {
    Authorization: `Bearer ${getMoySkladToken()}`,
    Accept: "application/json;charset=utf-8",
    "Content-Type": "application/json;charset=utf-8",
  };
}

export function buildMoySkladEntityMeta(type: string, idOrHref: string): MoySkladMeta {
  const href = idOrHref.startsWith("http")
    ? idOrHref
    : `${MOYSKLAD_BASE_URL}/entity/${type}/${idOrHref}`;

  return {
    href,
    type,
    mediaType: "application/json",
  };
}

function buildUrl(path: string) {
  if (path.startsWith("http")) {
    return path;
  }

  return `${MOYSKLAD_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function getIdFromHref(href: string) {
  return href.split("?")[0].split("/").pop() ?? "";
}

async function moySkladFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      ...getJsonHeaders(),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.text();
  let data: unknown = null;

  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "errors" in data
        ? JSON.stringify(data.errors)
        : payload;

    throw new MoySkladRequestError({
      path,
      statusCode: response.status,
      responseBody: payload,
      message: `MOYSKLAD_REQUEST_FAILED ${response.status}: ${message}`,
    });
  }

  return data as T;
}

async function listAll<T>(path: string, init: RequestInit = {}) {
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  let offset = 0;
  const limit = 1000;

  while (true) {
    const data = await moySkladFetch<MoySkladListResponse<T>>(
      `${path}${separator}limit=${limit}&offset=${offset}`,
      init,
    );

    rows.push(...(data.rows ?? []));

    if (!data.rows || data.rows.length < limit) {
      break;
    }

    offset += limit;
  }

  return rows;
}

export function getMoySkladProductFolders() {
  return listAll<MoySkladProductFolder>("/entity/productfolder");
}

export function getMoySkladAssortment() {
  return listAll<MoySkladAssortmentRow>("/entity/assortment", {
    headers: {
      "X-Lognex-Remap-Beta-Feature": "assortmentWithoutStock",
      "Accept-Encoding": "gzip",
    },
  });
}

export async function getMoySkladAssortmentByIds(assortmentIds: string[]) {
  const idSet = new Set(assortmentIds);

  if (idSet.size === 0) {
    return [];
  }

  const rows = await getMoySkladAssortment();

  return rows.filter((row) => idSet.has(row.id));
}

async function getCounterpartyTelegramIdAttributeMeta() {
  if (counterpartyTelegramIdAttributeMeta !== undefined) {
    return counterpartyTelegramIdAttributeMeta;
  }

  const configuredHref = process.env.MOYSKLAD_COUNTERPARTY_TELEGRAM_ID_ATTRIBUTE_HREF;

  if (configuredHref) {
    counterpartyTelegramIdAttributeMeta = {
      href: configuredHref,
      type: "attributemetadata",
      mediaType: "application/json",
    };
    return counterpartyTelegramIdAttributeMeta;
  }

  const attributeName =
    process.env.MOYSKLAD_COUNTERPARTY_TELEGRAM_ID_ATTRIBUTE_NAME ?? "telegramId";
  const attributes = await listAll<MoySkladAttributeMetadata>(
    "/entity/counterparty/metadata/attributes",
  );
  const matchedAttribute = attributes.find((attribute) => {
    return attribute.name.toLowerCase() === attributeName.toLowerCase();
  });

  counterpartyTelegramIdAttributeMeta = matchedAttribute?.meta ?? null;

  return counterpartyTelegramIdAttributeMeta;
}

export async function getCustomerOrderDeliveryTypeAttributeMeta() {
  const configuredHref =
    process.env.MOYSKLAD_ORDER_DELIVERY_TYPE_ATTRIBUTE_HREF ??
    DEFAULT_CUSTOMER_ORDER_DELIVERY_TYPE_ATTRIBUTE_HREF;

  return {
    href: configuredHref,
    type: "attributemetadata",
    mediaType: "application/json",
  };
}

async function getCustomerOrderAttributeMetadata() {
  if (customerOrderAttributeMetadata) {
    return customerOrderAttributeMetadata;
  }

  customerOrderAttributeMetadata = await listAll<MoySkladAttributeMetadata>(
    "/entity/customerorder/metadata/attributes",
  );

  return customerOrderAttributeMetadata;
}

async function getCustomerOrderAttributeMetaByName(attributeName: string) {
  const normalizedName = attributeName.trim().toLowerCase();

  if (customerOrderAttributeMetaByName.has(normalizedName)) {
    return customerOrderAttributeMetaByName.get(normalizedName) ?? null;
  }

  const attributes = await getCustomerOrderAttributeMetadata();
  const matchedAttribute = attributes.find((attribute) => {
    return attribute.name.trim().toLowerCase() === normalizedName;
  });
  const meta = matchedAttribute?.meta ?? null;

  customerOrderAttributeMetaByName.set(normalizedName, meta);

  return meta;
}

async function getCustomerOrderPaymentTypeAttributeMeta() {
  const configuredHref = process.env.MOYSKLAD_ORDER_PAYMENT_TYPE_ATTRIBUTE_HREF;

  if (configuredHref) {
    return {
      href: configuredHref,
      type: "attributemetadata",
      mediaType: "application/json",
    };
  }

  return getCustomerOrderAttributeMetaByName(
    process.env.MOYSKLAD_ORDER_PAYMENT_TYPE_ATTRIBUTE_NAME ?? "Тип оплаты",
  );
}

async function getCustomerOrderReceivingAddressAttributeMeta() {
  const configuredHref =
    process.env.MOYSKLAD_ORDER_RECEIVING_ADDRESS_ATTRIBUTE_HREF;

  if (configuredHref) {
    return {
      href: configuredHref,
      type: "attributemetadata",
      mediaType: "application/json",
    };
  }

  return getCustomerOrderAttributeMetaByName(
    process.env.MOYSKLAD_ORDER_RECEIVING_ADDRESS_ATTRIBUTE_NAME ??
      "Адрес получения",
  );
}

async function buildCounterpartyTelegramIdAttribute(telegramId?: string | bigint | null) {
  if (telegramId === undefined || telegramId === null) {
    return null;
  }

  const attributeMeta = await getCounterpartyTelegramIdAttributeMeta();

  if (!attributeMeta) {
    throw new Error("MOYSKLAD_COUNTERPARTY_TELEGRAM_ID_ATTRIBUTE_NOT_FOUND");
  }

  return {
    meta: attributeMeta,
    value: Number(telegramId),
  };
}

async function buildCustomerOrderDeliveryTypeAttribute(deliveryType: string) {
  const attributeMeta = await getCustomerOrderDeliveryTypeAttributeMeta();

  if (!attributeMeta) {
    throw new Error("MOYSKLAD_ORDER_DELIVERY_TYPE_ATTRIBUTE_NOT_FOUND");
  }

  return {
    meta: attributeMeta,
    value: deliveryType,
  };
}

async function buildCustomerOrderPaymentTypeAttribute(paymentType: string) {
  const attributeMeta = await getCustomerOrderPaymentTypeAttributeMeta();

  if (!attributeMeta) {
    throw new Error("MOYSKLAD_ORDER_PAYMENT_TYPE_ATTRIBUTE_NOT_FOUND");
  }

  return {
    meta: attributeMeta,
    value: paymentType,
  };
}

async function buildCustomerOrderReceivingAddressAttribute(receivingAddress: string) {
  const attributeMeta = await getCustomerOrderReceivingAddressAttributeMeta();

  if (!attributeMeta) {
    throw new Error("MOYSKLAD_ORDER_RECEIVING_ADDRESS_ATTRIBUTE_NOT_FOUND");
  }

  return {
    meta: attributeMeta,
    value: receivingAddress,
  };
}

async function buildCustomerOrderAttributes(input: {
  deliveryType?: string;
  paymentType?: string;
  receivingAddress?: string | null;
}) {
  const attributes: Array<{
    meta: MoySkladMeta;
    value: string;
  }> = [];

  if (input.deliveryType !== undefined) {
    attributes.push(await buildCustomerOrderDeliveryTypeAttribute(input.deliveryType));
  }

  if (input.paymentType !== undefined) {
    attributes.push(await buildCustomerOrderPaymentTypeAttribute(input.paymentType));
  }

  if (input.receivingAddress !== undefined && input.receivingAddress !== null) {
    attributes.push(
      await buildCustomerOrderReceivingAddressAttribute(input.receivingAddress),
    );
  }

  return attributes;
}

function normalizeMoySkladStateName(name: string) {
  return name.trim().toLowerCase().replace(/ё/g, "е");
}

async function getCustomerOrderStates() {
  if (customerOrderStates) {
    return customerOrderStates;
  }

  const metadata = await moySkladFetch<MoySkladCustomerOrderMetadata>(
    "/entity/customerorder/metadata",
  );
  const states = metadata.states;

  customerOrderStates = Array.isArray(states) ? states : states?.rows ?? [];

  return customerOrderStates;
}

async function getCustomerOrderStateMeta(input: {
  configuredHref?: string;
  nameIncludes: string[];
}) {
  if (input.configuredHref) {
    return buildMoySkladEntityMeta("state", input.configuredHref);
  }

  const stateNames = input.nameIncludes.map(normalizeMoySkladStateName);
  const states = await getCustomerOrderStates();
  const matchedState = states.find((state) => {
    const stateName = normalizeMoySkladStateName(state.name);

    return stateNames.some((name) => stateName.includes(name));
  });

  if (!matchedState) {
    return null;
  }

  return matchedState.meta;
}

export function getMoySkladCustomerOrderDeliveryType(order: MoySkladCustomerOrder) {
  const deliveryTypeAttributeHref =
    process.env.MOYSKLAD_ORDER_DELIVERY_TYPE_ATTRIBUTE_HREF ??
    DEFAULT_CUSTOMER_ORDER_DELIVERY_TYPE_ATTRIBUTE_HREF;
  const deliveryTypeAttributeId = getIdFromHref(deliveryTypeAttributeHref);
  const attribute = order.attributes?.find((item) => {
    const href = item.meta?.href;
    const id = href ? getIdFromHref(href) : "";

    return href === deliveryTypeAttributeHref || id === deliveryTypeAttributeId;
  });

  return typeof attribute?.value === "string" ? attribute.value : null;
}

async function getMoySkladCustomerOrderNamedAttribute(
  order: MoySkladCustomerOrder,
  attributeMeta: MoySkladMeta | null,
) {
  if (!attributeMeta) {
    return null;
  }

  const attributeId = getIdFromHref(attributeMeta.href);
  const attribute = order.attributes?.find((item) => {
    const href = item.meta?.href;
    const id = href ? getIdFromHref(href) : "";

    return href === attributeMeta.href || id === attributeId;
  });

  return typeof attribute?.value === "string" ? attribute.value : null;
}

export async function getMoySkladCustomerOrderPaymentType(
  order: MoySkladCustomerOrder,
) {
  return getMoySkladCustomerOrderNamedAttribute(
    order,
    await getCustomerOrderPaymentTypeAttributeMeta(),
  );
}

export async function getMoySkladCustomerOrderReceivingAddress(
  order: MoySkladCustomerOrder,
) {
  return getMoySkladCustomerOrderNamedAttribute(
    order,
    await getCustomerOrderReceivingAddressAttributeMeta(),
  );
}

export async function getMoySkladOrderCanceledStateMeta() {
  return getCustomerOrderStateMeta({
    configuredHref: process.env.MOYSKLAD_ORDER_CANCELED_STATE_HREF,
    nameIncludes: ["отмен", "cancel"],
  });
}

export async function getMoySkladOrderPreparingStateMeta() {
  return getCustomerOrderStateMeta({
    configuredHref: process.env.MOYSKLAD_ORDER_PREPARING_STATE_HREF,
    nameIncludes: ["собран"],
  });
}

export async function createMoySkladCounterparty(input: {
  name: string;
  phone: string;
  description?: string;
  telegramId?: string | bigint | null;
}) {
  const telegramIdAttribute = await buildCounterpartyTelegramIdAttribute(
    input.telegramId,
  );

  return moySkladFetch<MoySkladCounterparty>("/entity/counterparty", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone,
      companyType: "individual",
      tags: ["tg mini app"],
      description: input.description,
      ...(telegramIdAttribute
        ? {
            attributes: [telegramIdAttribute],
          }
        : {}),
    }),
  });
}

export async function updateMoySkladCounterpartyTelegramId(input: {
  counterpartyId: string;
  telegramId?: string | bigint | null;
}) {
  const telegramIdAttribute = await buildCounterpartyTelegramIdAttribute(
    input.telegramId,
  );

  if (!telegramIdAttribute) {
    return;
  }

  await moySkladFetch<MoySkladCounterparty>(
    `/entity/counterparty/${input.counterpartyId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        attributes: [telegramIdAttribute],
      }),
    },
  );
}

export async function updateMoySkladCounterpartyContact(input: {
  counterpartyId: string;
  name: string;
  phone: string;
}) {
  return moySkladFetch<MoySkladCounterparty>(
    `/entity/counterparty/${input.counterpartyId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
      }),
    },
  );
}

export function getMoySkladCounterparty(counterpartyId: string) {
  return moySkladFetch<MoySkladCounterparty>(
    `/entity/counterparty/${counterpartyId}`,
  );
}

export async function createMoySkladCustomerOrder(input: {
  counterpartyId: string;
  positions: Array<{
    quantity: number;
    price: number;
    assortmentMeta: MoySkladMeta;
    reserve?: number;
  }>;
  description?: string;
  deliveryPlannedMoment?: string;
  deliveryType: string;
  paymentType: string;
  receivingAddress?: string | null;
}) {
  const organizationHref = process.env.MOYSKLAD_ORGANIZATION_HREF;
  const storeHref = process.env.MOYSKLAD_STORE_HREF;
  const stateHref = process.env.MOYSKLAD_ORDER_STATE_HREF;

  if (!organizationHref) {
    throw new Error("MOYSKLAD_ORGANIZATION_HREF is not configured");
  }

  if (!storeHref) {
    throw new Error("MOYSKLAD_STORE_HREF is not configured");
  }

  const attributes = await buildCustomerOrderAttributes({
    deliveryType: input.deliveryType,
    paymentType: input.paymentType,
    receivingAddress: input.receivingAddress,
  });

  return moySkladFetch<MoySkladCustomerOrder>("/entity/customerorder", {
    method: "POST",
    body: JSON.stringify({
      applicable: true,
      organization: {
        meta: buildMoySkladEntityMeta("organization", organizationHref),
      },
      store: {
        meta: buildMoySkladEntityMeta("store", storeHref),
      },
      agent: {
        meta: buildMoySkladEntityMeta("counterparty", input.counterpartyId),
      },
      ...(stateHref
        ? {
            state: {
              meta: buildMoySkladEntityMeta("state", stateHref),
            },
          }
        : {}),
      description: input.description,
      ...(input.deliveryPlannedMoment
        ? {
            deliveryPlannedMoment: input.deliveryPlannedMoment,
          }
        : {}),
      attributes,
      positions: input.positions.map((position) => ({
        quantity: position.quantity,
        reserve: position.reserve ?? position.quantity,
        price: position.price,
        assortment: {
          meta: position.assortmentMeta,
        },
      })),
    }),
  });
}

export function getMoySkladCustomerOrdersByCounterparty(counterpartyId: string) {
  const agentHref = buildMoySkladEntityMeta("counterparty", counterpartyId).href;
  const params = new URLSearchParams({
    filter: `agent=${agentHref}`,
    expand: "positions.assortment,state,agent",
    order: "created,desc",
  });

  return listAll<MoySkladCustomerOrder>(`/entity/customerorder?${params}`);
}

export function getMoySkladCustomerOrder(orderId: string) {
  return moySkladFetch<MoySkladCustomerOrder>(
    `/entity/customerorder/${orderId}?expand=positions.assortment,state,agent`,
  );
}

export async function updateMoySkladCustomerOrder(input: {
  orderId: string;
  description?: string;
  deliveryPlannedMoment?: string | null;
  deliveryType?: string;
  paymentType?: string;
  receivingAddress?: string | null;
  stateMeta?: MoySkladMeta;
}) {
  const attributes = await buildCustomerOrderAttributes({
    deliveryType: input.deliveryType,
    paymentType: input.paymentType,
    receivingAddress: input.receivingAddress,
  });

  return moySkladFetch<MoySkladCustomerOrder>(
    `/entity/customerorder/${input.orderId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...(input.description !== undefined
          ? {
              description: input.description,
            }
          : {}),
        ...(input.deliveryPlannedMoment !== undefined
          ? {
              deliveryPlannedMoment: input.deliveryPlannedMoment,
            }
          : {}),
        ...(input.stateMeta
          ? {
              state: {
                meta: input.stateMeta,
              },
            }
          : {}),
        ...(attributes.length > 0
          ? {
              attributes,
            }
          : {}),
      }),
    },
  );
}

export async function getMoySkladCustomerOrderPositions(
  order: MoySkladCustomerOrder,
) {
  const embeddedPositions = order.positions?.rows ?? [];

  if (embeddedPositions.length > 0) {
    return embeddedPositions;
  }

  const positionsHref = order.positions?.meta?.href;

  if (!positionsHref) {
    return [];
  }

  const separator = positionsHref.includes("?") ? "&" : "?";
  const positionsList = await moySkladFetch<MoySkladPositionsList>(
    `${positionsHref}${separator}expand=assortment`,
  );

  return positionsList.rows ?? [];
}

export async function getMoySkladAvailableStocksByAssortments(
  assortments: Array<{
    id: string;
    meta: MoySkladMeta;
  }>,
) {
  const uniqueAssortments = Array.from(
    new Map(assortments.map((item) => [item.id, item])).values(),
  );
  const ids = uniqueAssortments.map((assortment) => assortment.id);

  if (ids.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    stockType: "quantity",
    include: "zeroLines",
    filter: `assortmentId=${ids.join(",")}`,
  });
  const rows = await moySkladFetch<MoySkladShortStockRow[]>(
    `/report/stock/all/current?${params}`,
    {
      headers: {
        "Accept-Encoding": "gzip",
      },
    },
  );
  const stockById = new Map(
    rows.map((row) => [
      row.assortmentId,
      Math.max(0, Math.floor(row.quantity ?? 0)),
    ]),
  );

  return ids.map((id) => ({
    assortmentId: id,
    availableQuantity: stockById.get(id) ?? 0,
  }));
}

export async function getMoySkladAvailableStocksReport() {
  const params = new URLSearchParams({
    stockType: "quantity",
    include: "zeroLines",
  });
  const rows = await moySkladFetch<MoySkladShortStockRow[]>(
    `/report/stock/all/current?${params}`,
    {
      headers: {
        "Accept-Encoding": "gzip",
      },
    },
  );

  return rows.map((row) => ({
    assortmentId: row.assortmentId,
    availableQuantity: Math.max(0, Math.floor(row.quantity ?? 0)),
  }));
}

export async function getMoySkladStockByAssortmentId(assortmentId: string) {
  return getMoySkladStockByAssortmentMeta(
    buildMoySkladEntityMeta("assortment", assortmentId),
  );
}

export async function getMoySkladStockByAssortmentMeta(assortmentMeta: MoySkladMeta) {
  const assortmentId = assortmentMeta.href.split("/").pop() ?? "";
  const params = new URLSearchParams({
    filter: `assortment=${assortmentMeta.href}`,
  });

  try {
    const rows = await listAll<{ stock?: number; quantity?: number }>(
      `/report/stock/all/current?${params}`,
    );
    const firstRow = rows[0];

    if (firstRow) {
      return Math.max(0, Math.floor(firstRow.stock ?? firstRow.quantity ?? 0));
    }
  } catch {
    // Some MoySklad accounts restrict stock reports; fall back below.
  }

  const legacyParams = new URLSearchParams({
    filter: `assortmentId=${assortmentId}`,
  });

  try {
    const rows = await listAll<{ stock?: number; quantity?: number }>(
      `/report/stock/all/current?${legacyParams}`,
    );
    const firstRow = rows[0];

    if (firstRow) {
      return Math.max(0, Math.floor(firstRow.stock ?? firstRow.quantity ?? 0));
    }
  } catch {
    // Keep the old filter as a fallback, then use the exact entity href.
  }

  const assortment = await moySkladFetch<MoySkladAssortmentRow>(assortmentMeta.href);

  return Math.max(0, Math.floor(assortment.stock ?? assortment.quantity ?? 0));
}

export async function getMoySkladWebhookDocumentAssortmentIds(input: {
  id: string;
  type: string;
}) {
  const entity = WEBHOOK_DOCUMENT_ENTITY_BY_TYPE[input.type];

  if (!entity) {
    throw new Error("MOYSKLAD_WEBHOOK_TYPE_UNSUPPORTED");
  }

  if (entity === "counterparty") {
    return [];
  }

  const document = await moySkladFetch<{
    positions?: {
      meta?: MoySkladMeta;
      rows?: MoySkladOrderPosition[];
    };
  }>(`/entity/${entity}/${input.id}?expand=positions.assortment`);
  const positions = await getMoySkladCustomerOrderPositions(document as MoySkladCustomerOrder);

  return Array.from(
    new Set(
      positions
        .map((position) => {
          return position.assortment?.id ?? position.assortment?.meta.href.split("/").pop();
        })
        .filter((id): id is string => Boolean(id)),
    ),
  );
}
