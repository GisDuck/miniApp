import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const SESSION_COOKIE = "admin_session";

type AuthUser = {
  username: string;
  passwordHash: string;
};

type AuthFile = {
  users: AuthUser[];
};

function getAuthFilePath() {
  return process.env.ADMIN_AUTH_FILE ?? "./auth/users.json";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "change-this-admin-session-secret";
}

function isCookieSecure() {
  return process.env.ADMIN_COOKIE_SECURE === "true";
}

function loadUsers(): AuthUser[] {
  const payload = readFileSync(getAuthFilePath(), "utf8");
  const parsed = JSON.parse(payload) as AuthFile;

  if (!Array.isArray(parsed.users)) {
    throw new Error("ADMIN_AUTH_FILE must contain users array");
  }

  return parsed.users;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeSession(username: string) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ username, issuedAt }), "utf8").toString(
    "base64url",
  );

  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      issuedAt?: number;
    };

    if (!decoded.username || !decoded.issuedAt) {
      return null;
    }

    return decoded.username;
  } catch {
    return null;
  }
}

function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, expectedHash] = passwordHash.split("$");

  if (scheme !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "base64url");

  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function validateCredentials(username: string, password: string) {
  const user = loadUsers().find((candidate) => candidate.username === username);

  if (!user) {
    return false;
  }

  return verifyPassword(password, user.passwordHash);
}

export function setSessionCookie(reply: FastifyReply, username: string) {
  reply.setCookie(SESSION_COOKIE, encodeSession(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
  } as const;

  reply.clearCookie(SESSION_COOKIE, cookieOptions);
  reply.setCookie(SESSION_COOKIE, "", {
    ...cookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const username = decodeSession(request.cookies[SESSION_COOKIE]);

  if (!username) {
    return reply.status(401).send({
      message: "Требуется вход в админку",
    });
  }

  request.adminUsername = username;
}

export function getCurrentAdmin(request: FastifyRequest) {
  return decodeSession(request.cookies[SESSION_COOKIE]);
}

export async function registerAuthHook(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (
      !request.url.startsWith("/api") ||
      request.url === "/api/login" ||
      request.url === "/api/logout"
    ) {
      return;
    }

    await requireAdmin(request, reply);
  });
}
