import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma";

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const categories = await prisma.category.findMany({
      orderBy: {
        title: "asc",
      },
    });

    return [
      {
        id: 0,
        title: "Все",
      },
      ...categories,
    ];
  });
};