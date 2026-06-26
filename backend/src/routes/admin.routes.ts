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
      request.log.warn("admin_catalog_refresh_unauthorized");
      return reply.status(401).send({
        message: "Unauthorized",
      });
    }

    request.log.info("admin_catalog_refresh_started");

    let snapshot: Awaited<ReturnType<typeof refreshCatalogCache>>;

    try {
      snapshot = await refreshCatalogCache();
    } catch (error) {
      request.log.error({ err: error }, "admin_catalog_refresh_failed");
      throw error;
    }

    request.log.info(
      {
        refreshedAt: snapshot.refreshedAt,
        productsCount: snapshot.products.length,
        categoriesCount: snapshot.categories.length,
      },
      "admin_catalog_refresh_completed",
    );

    return {
      refreshedAt: snapshot.refreshedAt,
      productsCount: snapshot.products.length,
      categoriesCount: snapshot.categories.length,
    };
  });
};
