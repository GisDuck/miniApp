import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma.js";

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return prisma.category.findMany({
      orderBy: {
        title: "asc",
      },
    });
  });

  app.post("/", async (request, reply) => {
    const body = (request.body ?? {}) as {
      title?: string;
    };
    const title = body.title?.trim() ?? "";

    if (!title) {
      return reply.status(400).send({
        message: "Введите название категории",
      });
    }

    return prisma.category.create({
      data: {
        title,
      },
    });
  });

  app.patch("/:categoryId", async (request, reply) => {
    const params = request.params as {
      categoryId: string;
    };
    const categoryId = Number(params.categoryId);
    const body = (request.body ?? {}) as {
      title?: string;
    };
    const title = body.title?.trim() ?? "";

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id категории",
      });
    }

    if (!title) {
      return reply.status(400).send({
        message: "Введите название категории",
      });
    }

    return prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        title,
      },
    });
  });
};
