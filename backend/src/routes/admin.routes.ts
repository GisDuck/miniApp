import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { refreshCatalogCache } from "../services/catalog.service";

function getHeaderValue(request: FastifyRequest, headerName: string) {
  const value = request.headers[headerName.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function isAuthorized(request: FastifyRequest) {
  const token = process.env.ADMIN_API_TOKEN ?? process.env.CATALOG_REFRESH_TOKEN;

  if (!token) {
    throw new Error("ADMIN_API_TOKEN is not configured");
  }

  const authorization = getHeaderValue(request, "authorization");
  const adminToken = getHeaderValue(request, "x-admin-token");

  return authorization === `Bearer ${token}` || adminToken === token;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/catalog/refresh", async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.status(401).send({
        message: "Unauthorized",
      });
    }

    const snapshot = await refreshCatalogCache();

    return {
      refreshedAt: snapshot.refreshedAt,
      productsCount: snapshot.products.length,
      categoriesCount: snapshot.categories.length,
    };
  });
};
