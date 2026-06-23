import type { FastifyPluginAsync } from "fastify";

import {
  clearSessionCookie,
  getCurrentAdmin,
  revokeCurrentAdminSession,
  setSessionCookie,
  validateCredentials,
} from "../lib/auth.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request, reply) => {
    const body = (request.body ?? {}) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password || !validateCredentials(username, password)) {
      return reply.status(401).send({
        message: "Неверный логин или пароль",
      });
    }

    setSessionCookie(reply, username);

    return {
      username,
    };
  });

  app.post("/logout", async (request, reply) => {
    revokeCurrentAdminSession(request);
    clearSessionCookie(reply);

    return {
      ok: true,
    };
  });

  app.get("/me", async (request, reply) => {
    const username = getCurrentAdmin(request);

    if (!username) {
      return reply.status(401).send({
        message: "Требуется вход в админку",
      });
    }

    return {
      username,
    };
  });
};
