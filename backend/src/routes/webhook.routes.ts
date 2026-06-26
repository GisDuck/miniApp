import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { refreshCatalogVariantStocks } from "../services/catalog.service";
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
    return {
      statusCode: 400,
      payload: {
        message: "Invalid webhook id",
      },
    };
  }

  if (!query.type || !ALLOWED_WEBHOOK_TYPES.has(query.type)) {
    return {
      statusCode: 400,
      payload: {
        message: "Invalid webhook type",
      },
    };
  }

  const productVariantIds = await getMoySkladWebhookDocumentAssortmentIds({
    id: query.id,
    type: query.type,
  });

  if (productVariantIds.length === 0) {
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

  const snapshot = await refreshCatalogVariantStocks(productVariantIds);

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
  app.route({
    method: ["GET", "POST"],
    url: "/moysklad",
    handler: async (request, reply) => {
      if (!isAuthorized(request)) {
        return reply.status(401).send({
          message: "Unauthorized",
        });
      }

      const result = await handleMoySkladWebhook(request);

      return reply.status(result.statusCode).send(result.payload);
    },
  });

  app.route({
    method: ["GET", "POST"],
    url: "/moysklad/stock",
    handler: async (request, reply) => {
      if (!isAuthorized(request)) {
        return reply.status(401).send({
          message: "Unauthorized",
        });
      }

      const result = await handleMoySkladWebhook(request);

      return reply.status(result.statusCode).send(result.payload);
    },
  });
};
