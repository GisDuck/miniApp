import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  redisDelete,
  redisGetJson,
  redisSetJson,
  redisSetLock,
} from "../lib/redis";

const IDEMPOTENCY_HEADER = "idempotency-key";
const RESULT_TTL_SECONDS = 60 * 60;
const LOCK_TTL_SECONDS = 60;
const WAIT_FOR_RESULT_MS = 5000;
const WAIT_STEP_MS = 200;

const METHODS_WITHOUT_IDEMPOTENCY = new Set(["GET", "HEAD", "OPTIONS"]);
const PATH_PREFIXES_WITHOUT_IDEMPOTENCY = ["/admin/", "/webhooks/"];

type StoredIdempotencyResult = {
  fingerprint: string;
  statusCode: number;
  contentType?: string;
  payload: string;
};

type IdempotencyContext = {
  resultKey: string;
  lockKey: string;
  fingerprint: string;
};

declare module "fastify" {
  interface FastifyRequest {
    idempotencyContext?: IdempotencyContext;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getHeaderValue(request: FastifyRequest, headerName: string) {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildFingerprint(request: FastifyRequest) {
  const initData = getHeaderValue(request, "x-telegram-init-data") ?? "";
  const body = request.body === undefined ? "" : JSON.stringify(request.body);

  return hashValue(
    JSON.stringify({
      method: request.method,
      url: request.url,
      initDataHash: hashValue(String(initData)),
      body,
    }),
  );
}

function buildRedisKey(request: FastifyRequest, idempotencyKey: string) {
  const initData = getHeaderValue(request, "x-telegram-init-data") ?? "";
  const scope = hashValue(`${String(initData)}:${idempotencyKey}`);

  return {
    resultKey: `idempotency:result:${scope}`,
    lockKey: `idempotency:lock:${scope}`,
  };
}

async function sendStoredResult(
  reply: FastifyReply,
  storedResult: StoredIdempotencyResult,
) {
  if (storedResult.contentType) {
    reply.header("content-type", storedResult.contentType);
  }

  if (storedResult.contentType?.includes("application/json")) {
    return reply.status(storedResult.statusCode).send(JSON.parse(storedResult.payload));
  }

  return reply.status(storedResult.statusCode).send(storedResult.payload);
}

async function waitForStoredResult(resultKey: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < WAIT_FOR_RESULT_MS) {
    await wait(WAIT_STEP_MS);

    const storedResult =
      await redisGetJson<StoredIdempotencyResult>(resultKey);

    if (storedResult) {
      return storedResult;
    }
  }

  return null;
}

export async function idempotencyPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (METHODS_WITHOUT_IDEMPOTENCY.has(request.method)) {
      return;
    }

    if (
      PATH_PREFIXES_WITHOUT_IDEMPOTENCY.some((pathPrefix) =>
        request.url.startsWith(pathPrefix),
      )
    ) {
      return;
    }

    const idempotencyKey = getHeaderValue(request, IDEMPOTENCY_HEADER);

    if (!idempotencyKey) {
      return reply.status(400).send({
        message: "Idempotency-Key обязателен для этого запроса",
      });
    }

    const fingerprint = buildFingerprint(request);
    const { resultKey, lockKey } = buildRedisKey(request, String(idempotencyKey));

    const storedResult = await redisGetJson<StoredIdempotencyResult>(resultKey);

    if (storedResult) {
      if (storedResult.fingerprint !== fingerprint) {
        return reply.status(409).send({
          message: "Idempotency-Key уже использовался для другого запроса",
        });
      }

      return sendStoredResult(reply, storedResult);
    }

    const isLocked = await redisSetLock(lockKey, fingerprint, LOCK_TTL_SECONDS);

    if (!isLocked) {
      const completedResult = await waitForStoredResult(resultKey);

      if (completedResult?.fingerprint === fingerprint) {
        return sendStoredResult(reply, completedResult);
      }

      return reply.status(409).send({
        code: "IDEMPOTENCY_IN_PROGRESS",
        message: "Запрос еще выполняется, повторите позже",
      });
    }

    request.idempotencyContext = {
      resultKey,
      lockKey,
      fingerprint,
    };
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const context = request.idempotencyContext;

    if (!context) {
      return payload;
    }

    try {
      if (reply.statusCode < 500) {
        const contentType = reply.getHeader("content-type");

        await redisSetJson(
          context.resultKey,
          {
            fingerprint: context.fingerprint,
            statusCode: reply.statusCode,
            contentType:
              typeof contentType === "string" ? contentType : undefined,
            payload: typeof payload === "string" ? payload : String(payload),
          },
          RESULT_TTL_SECONDS,
        );
      }
    } finally {
      await redisDelete(context.lockKey);
    }

    return payload;
  });
}
