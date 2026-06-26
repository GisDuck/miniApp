const MOYSKLAD_BASE_URL =
  process.env.MOYSKLAD_BASE_URL ?? "https://api.moysklad.ru/api/remap/1.2";

export type MoySkladMeta = {
  href: string;
  type: string;
  mediaType: string;
  metadataHref?: string;
  uuidHref?: string;
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
  pathName?: string;
  archived?: boolean;
};

export type MoySkladOrderPosition = {
  id?: string;
  quantity?: number;
  price?: number;
  assortment?: MoySkladAssortmentRow;
};

export type MoySkladCustomerOrder = {
  id: string;
  name: string;
  meta: MoySkladMeta;
  created?: string;
  updated?: string;
  moment?: string;
  sum?: number;
  shipmentAddress?: string;
  agent?: {
    name?: string;
    phone?: string;
    meta?: MoySkladMeta;
  };
  state?: {
    name?: string;
    meta?: MoySkladMeta;
  };
  positions?: {
    rows?: MoySkladOrderPosition[];
  };
};

type MoySkladListResponse<T> = {
  rows: T[];
};

function getToken() {
  const token = process.env.MOYSKLAD_TOKEN;

  if (!token) {
    throw new Error("MOYSKLAD_TOKEN is not configured");
  }

  return token;
}

function buildUrl(path: string) {
  if (path.startsWith("http")) {
    return path;
  }

  return `${MOYSKLAD_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function moySkladFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json;charset=utf-8",
      "Content-Type": "application/json;charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.text();
  const data = payload ? JSON.parse(payload) : null;

  if (!response.ok) {
    throw new Error(`MOYSKLAD_REQUEST_FAILED ${response.status}: ${payload}`);
  }

  return data as T;
}

export async function listAll<T>(path: string) {
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

export function getMoySkladAssortment() {
  return listAll<MoySkladAssortmentRow>("/entity/assortment");
}

export function getMoySkladProductFolders() {
  return listAll<MoySkladProductFolder>("/entity/productfolder");
}

export function getMoySkladCustomerOrders() {
  const params = new URLSearchParams({
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
