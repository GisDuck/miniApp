import Fastify from "fastify";
import cors from "@fastify/cors";

import { healthRoutes } from "./routes/health.routes";
import { categoriesRoutes } from "./routes/categories.routes";
import { productsRoutes } from "./routes/products.routes";
import { cartRoutes } from "./routes/cart.routes";
import { orderRoutes } from "./routes/order.routes";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  const allowedOrigins = [
    "http://127.0.0.1:9293",
    "http://localhost:9293",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  app.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Telegram-Init-Data",
    ],
  });

  app.setErrorHandler((error, request, reply) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === "TELEGRAM_INIT_DATA_MISSING") {
      return reply.status(401).send({
        message: "Telegram initData отсутствует",
      });
    }

    if (errorMessage === "TELEGRAM_INIT_DATA_INVALID") {
      return reply.status(401).send({
        message: "Telegram initData не прошёл проверку",
      });
    }

    if (errorMessage === "TELEGRAM_BOT_TOKEN is not configured") {
      return reply.status(500).send({
        message: "TELEGRAM_BOT_TOKEN не настроен на сервере",
      });
    }

    request.log.error({ error });

    return reply.status(500).send({
      message: "Внутренняя ошибка сервера",
    });
  });

  app.register(healthRoutes);

  app.register(categoriesRoutes, {
    prefix: "api/categories",
  });

  app.register(productsRoutes, {
    prefix: "api/products",
  });

  app.register(cartRoutes, {
    prefix: "api/cart",
  });

  app.register(orderRoutes, {
    prefix: "api/orders",
  });

  return app;
}