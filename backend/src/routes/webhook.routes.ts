import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import {
  refreshCatalogCache,
  refreshCatalogVariantStocks,
} from "../services/catalog.service";
import {
  mapCachedOrder,
  updateCachedOrderStatusFromMoySklad,
  upsertCachedOrderFromMoySklad,
} from "../services/order-cache.service";
import {
  getMoySkladCustomerOrder,
  getMoySkladCustomerOrderForStatus,
  getMoySkladWebhookDocumentAssortmentIds,
} from "../services/moysklad.service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_WEBHOOK_TYPES = new Set([
  "CustomerOrder",
  "Demand",
  "Supply",
  "Move",
  "SalesReturn",
  "PurchaseReturn",
]);

type MoySkladWebhookQuery = {
  token?: string;
  id?: string;
  type?: string;
};

type WebhookResult = {
  statusCode: number;
  payload: object;
};

function getWebhookToken() {
  const token =
    process.env.MOYSKLAD_WEBHOOK_TOKEN ?? process.env.MOYSKLAD_WEBHOOK_SECRET;

  if (!token) {
    throw new Error("MOYSKLAD_WEBHOOK_TOKEN is not configured");
  }

  return token;
}

function isAuthorized(request: FastifyRequest) {
  const query = request.query as MoySkladWebhookQuery;

  return query.token === getWebhookToken();
}

function validateWebhookId(request: FastifyRequest): WebhookResult | null {
  const query = request.query as MoySkladWebhookQuery;

  if (!query.id || !UUID_PATTERN.test(query.id)) {
    request.log.warn(
      {
        type: query.type,
        idProvided: Boolean(query.id),
      },
      "moysklad_webhook_invalid_id",
    );
    return {
      statusCode: 400,
      payload: {
        message: "Invalid webhook id",
      },
    };
  }

  return null;
}

function validateWebhookType(request: FastifyRequest): WebhookResult | null {
  const query = request.query as MoySkladWebhookQuery;

  if (!query.type || !ALLOWED_WEBHOOK_TYPES.has(query.type)) {
    request.log.warn(
      {
        id: query.id,
        type: query.type,
      },
      "moysklad_webhook_invalid_type",
    );
    return {
      statusCode: 400,
      payload: {
        message: "Invalid webhook type",
      },
    };
  }

  return null;
}

async function handleMoySkladOrderWebhook(
  request: FastifyRequest,
): Promise<WebhookResult> {
  const query = request.query as MoySkladWebhookQuery;
  const idError = validateWebhookId(request);

  if (idError) {
    return idError;
  }

  request.log.info(
    {
      id: query.id,
    },
    "moysklad_order_webhook_received",
  );

  try {
    const order = await getMoySkladCustomerOrderForStatus(query.id!);
    const cachedOrder = await updateCachedOrderStatusFromMoySklad(order);

    if (cachedOrder) {
      request.log.info(
        {
          id: query.id,
          status: cachedOrder.status,
        },
        "moysklad_order_webhook_status_sync_completed",
      );

      return {
        statusCode: 200,
        payload: {
          mode: "order",
          id: query.id,
          orderCacheMode: "synced",
          order: mapCachedOrder(cachedOrder),
        },
      };
    }

    const fullOrder = await getMoySkladCustomerOrder(query.id!);
    const syncedOrder = await upsertCachedOrderFromMoySklad({
      order: fullOrder,
    });

    request.log.info(
      {
        id: query.id,
        orderCacheMode: syncedOrder ? "synced" : "unmatched",
      },
      "moysklad_order_webhook_full_sync_completed",
    );

    return {
      statusCode: 200,
      payload: {
        mode: "order",
        id: query.id,
        orderCacheMode: syncedOrder ? "synced" : "unmatched",
        order: syncedOrder ? mapCachedOrder(syncedOrder) : null,
      },
    };
  } catch (error) {
    request.log.error(
      {
        err: error,
        id: query.id,
      },
      "moysklad_order_webhook_sync_failed",
    );
    throw error;
  }
}

async function handleMoySkladStockWebhook(
  request: FastifyRequest,
): Promise<WebhookResult> {
  const query = request.query as MoySkladWebhookQuery;
  const idError = validateWebhookId(request);

  if (idError) {
    return idError;
  }

  const typeError = validateWebhookType(request);

  if (typeError) {
    return typeError;
  }

  request.log.info(
    {
      id: query.id,
      type: query.type,
    },
    "moysklad_stock_webhook_received",
  );

  let productVariantIds: string[];

  try {
    productVariantIds = await getMoySkladWebhookDocumentAssortmentIds({
      id: query.id!,
      type: query.type!,
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        id: query.id,
        type: query.type,
      },
      "moysklad_stock_webhook_document_fetch_failed",
    );
    throw error;
  }

  if (productVariantIds.length === 0) {
    request.log.info(
      {
        id: query.id,
        type: query.type,
      },
      "moysklad_stock_webhook_ignored_without_positions",
    );
    return {
      statusCode: 200,
      payload: {
        mode: "ignored",
        id: query.id,
        type: query.type,
        ids: [],
      },
    };
  }

  let snapshot: Awaited<ReturnType<typeof refreshCatalogVariantStocks>>;

  try {
    snapshot = await refreshCatalogVariantStocks(productVariantIds);
  } catch (error) {
    request.log.error(
      {
        err: error,
        id: query.id,
        type: query.type,
        productVariantIds,
      },
      "moysklad_stock_webhook_refresh_failed",
    );
    throw error;
  }

  request.log.info(
    {
      id: query.id,
      type: query.type,
      productVariantIds,
      refreshedAt: snapshot.refreshedAt,
    },
    "moysklad_stock_webhook_refresh_completed",
  );

  return {
    statusCode: 200,
    payload: {
      mode: "stocks",
      id: query.id,
      type: query.type,
      refreshedAt: snapshot.refreshedAt,
      ids: productVariantIds,
    },
  };
}

async function handleMoySkladCatalogWebhook(request: FastifyRequest) {
  request.log.info(
    {
      query: request.query,
    },
    "moysklad_catalog_webhook_received",
  );

  const snapshot = await refreshCatalogCache();

  request.log.info(
    {
      refreshedAt: snapshot.refreshedAt,
      productsCount: snapshot.products.length,
      categoriesCount: snapshot.categories.length,
    },
    "moysklad_catalog_webhook_refresh_completed",
  );

  return {
    mode: "catalog",
    refreshedAt: snapshot.refreshedAt,
    productsCount: snapshot.products.length,
    categoriesCount: snapshot.categories.length,
  };
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  async function handleAuthorizedWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
    unauthorizedLogMessage: string,
    handler: (request: FastifyRequest) => Promise<WebhookResult>,
  ) {
    if (!isAuthorized(request)) {
      request.log.warn(unauthorizedLogMessage);
      return reply.status(401).send({
        message: "Unauthorized",
      });
    }

    const result = await handler(request);

    return reply.status(result.statusCode).send(result.payload);
  }

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad/order",
    handler: async (request, reply) => {
      return handleAuthorizedWebhook(
        request,
        reply,
        "moysklad_order_webhook_unauthorized",
        handleMoySkladOrderWebhook,
      );
    },
  });

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad/stock",
    handler: async (request, reply) => {
      return handleAuthorizedWebhook(
        request,
        reply,
        "moysklad_stock_webhook_unauthorized",
        handleMoySkladStockWebhook,
      );
    },
  });

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad/catalog",
    handler: async (request, reply) => {
      if (!isAuthorized(request)) {
        request.log.warn("moysklad_catalog_webhook_unauthorized");
        return reply.status(401).send({
          message: "Unauthorized",
        });
      }

      return handleMoySkladCatalogWebhook(request);
    },
  });
};
