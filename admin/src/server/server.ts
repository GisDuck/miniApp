import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";

import { registerAuthHook } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.routes.js";
import { categoriesRoutes } from "./routes/categories.routes.js";
import { imagesRoutes } from "./routes/images.routes.js";
import { ordersRoutes } from "./routes/orders.routes.js";
import { productsRoutes } from "./routes/products.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cookie);
await app.register(multipart, {
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

await registerAuthHook(app);

app.setErrorHandler((error, request, reply) => {
  request.log.error({ error });

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FST_REQ_FILE_TOO_LARGE"
  ) {
    return reply.status(400).send({
      message: "Файл слишком большой",
    });
  }

  return reply.status(500).send({
    message: "Внутренняя ошибка админки",
  });
});

app.register(authRoutes, {
  prefix: "/api",
});
app.register(categoriesRoutes, {
  prefix: "/api/categories",
});
app.register(productsRoutes, {
  prefix: "/api/products",
});
app.register(imagesRoutes, {
  prefix: "/api",
});
app.register(ordersRoutes, {
  prefix: "/api/orders",
});

const clientRoot = path.resolve(__dirname, "../client");

app.register(staticPlugin, {
  root: clientRoot,
  prefix: "/",
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api")) {
    return reply.status(404).send({
      message: "Метод не найден",
    });
  }

  return reply.sendFile("index.html");
});

const port = Number(process.env.PORT ?? 8080);

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });

  console.log(`Admin started on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
