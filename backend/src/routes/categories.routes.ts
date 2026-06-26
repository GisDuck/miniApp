import type { FastifyPluginAsync } from "fastify";

import { getCatalogCategories } from "../services/catalog.service";

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    request.log.info("categories_fetch_started");

    return getCatalogCategories();
  });
};
