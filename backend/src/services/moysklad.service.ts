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

export type MoySkladCustomerOrder = {
  id: string;
  name: string;
  meta: MoySkladMeta;
  created?: string;
  updated?: string;
  moment?: string;
  sum?: number;
  payedSum?: number;
  shippedSum?: number;
  state?: {
    meta?: MoySkladMeta;
    name?: string;
  };
  positions?: {
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

async function listAll<T>(path: string) {
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  let offset = 0;
  const limit = 1000;

  while (true) {
    const data = await moySkladFetch<MoySkladListResponse<T>>(
      `${path}${separator}limit=${limit}&offset=${offset}`,
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
  return listAll<MoySkladAssortmentRow>("/entity/assortment");
}

export async function getMoySkladAssortmentByIds(assortmentIds: string[]) {
  const idSet = new Set(assortmentIds);

  if (idSet.size === 0) {
    return [];
  }

  const rows = await getMoySkladAssortment();

  return rows.filter((row) => idSet.has(row.id));
}

export async function createMoySkladCounterparty(input: {
  name: string;
  phone: string;
  description?: string;
}) {
  return moySkladFetch<MoySkladCounterparty>("/entity/counterparty", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone,
      description: input.description,
    }),
  });
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
    expand: "positions.assortment,state",
    order: "created,desc",
  });

  return listAll<MoySkladCustomerOrder>(`/entity/customerorder?${params}`);
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
  let positions = document.positions?.rows ?? [];

  if (positions.length === 0 && document.positions?.meta?.href) {
    const positionsList = await moySkladFetch<MoySkladPositionsList>(
      `${document.positions.meta.href}?expand=assortment`,
    );
    positions = positionsList.rows ?? [];
  }

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
