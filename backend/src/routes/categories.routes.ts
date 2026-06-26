import type { FastifyPluginAsync } from "fastify";

import { getCatalogCategories } from "../services/catalog.service";

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return getCatalogCategories();
  });
};
