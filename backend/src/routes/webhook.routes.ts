import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import {
  refreshCatalogCache,
  refreshCatalogVariantStocks,
} from "../services/catalog.service";
import { getMoySkladWebhookDocumentAssortmentIds } from "../services/moysklad.service";

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

function getWebhookToken() {
  const token = process.env.MOYSKLAD_WEBHOOK_TOKEN ?? process.env.MOYSKLAD_WEBHOOK_SECRET;

  if (!token) {
    throw new Error("MOYSKLAD_WEBHOOK_TOKEN is not configured");
  }

  return token;
}

function isAuthorized(request: FastifyRequest) {
  const query = request.query as MoySkladWebhookQuery;

  return query.token === getWebhookToken();
}

async function handleMoySkladWebhook(request: FastifyRequest) {
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

  request.log.info(
    {
      id: query.id,
      type: query.type,
    },
    "moysklad_webhook_received",
  );

  let productVariantIds: string[];

  try {
    productVariantIds = await getMoySkladWebhookDocumentAssortmentIds({
      id: query.id,
      type: query.type,
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        id: query.id,
        type: query.type,
      },
      "moysklad_webhook_document_fetch_failed",
    );
    throw error;
  }

  if (productVariantIds.length === 0) {
    request.log.info(
      {
        id: query.id,
        type: query.type,
      },
      "moysklad_webhook_ignored_without_positions",
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
      "moysklad_webhook_stock_refresh_failed",
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
    "moysklad_webhook_stock_refresh_completed",
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

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  async function handleAuthorizedStockWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
    unauthorizedLogMessage: string,
  ) {
    if (!isAuthorized(request)) {
      request.log.warn(unauthorizedLogMessage);
      return reply.status(401).send({
        message: "Unauthorized",
      });
    }

    const result = await handleMoySkladWebhook(request);

    return reply.status(result.statusCode).send(result.payload);
  }

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad",
    handler: async (request, reply) => {
      return handleAuthorizedStockWebhook(
        request,
        reply,
        "moysklad_webhook_unauthorized",
      );
    },
  });

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad/stock",
    handler: async (request, reply) => {
      return handleAuthorizedStockWebhook(
        request,
        reply,
        "moysklad_stock_webhook_unauthorized",
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
    },
  });
};
