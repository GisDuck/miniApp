import { getTelegramInitData } from "./telegram";
import { getApiUrl } from "../api/api";

const NETWORK_ERROR_MESSAGE = "проблема с сетью. попробуйте позже";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const MAX_SENSITIVE_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10000;
const METHODS_WITHOUT_IDEMPOTENCY = new Set(["GET", "HEAD", "OPTIONS"]);

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => {
    controller.abort();
  };

  if (externalSignal?.aborted) {
    controller.abort();
  }

  externalSignal?.addEventListener("abort", abortFromExternalSignal, {
    once: true,
  });

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

async function isIdempotencyInProgress(response: Response) {
  if (response.status !== 409) {
    return false;
  }

  try {
    const payload = await response.clone().json();

    return payload?.code === "IDEMPOTENCY_IN_PROGRESS";
  } catch {
    return false;
  }
}

export async function apiTGInitFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? "GET").toUpperCase();
  const needsIdempotency = !METHODS_WITHOUT_IDEMPOTENCY.has(method);

  const initData = getTelegramInitData();

  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  if (needsIdempotency) {
    headers.set(IDEMPOTENCY_HEADER, createIdempotencyKey());
  }

  const url = getApiUrl(path);
  const attemptsCount = needsIdempotency ? MAX_SENSITIVE_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attemptsCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        ...options,
        method,
        headers,
      });

      if (
        needsIdempotency &&
        attempt < attemptsCount &&
        (await isIdempotencyInProgress(response))
      ) {
        await wait(500);
        continue;
      }

      return response;
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }

      if (!needsIdempotency || attempt === attemptsCount) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }

      await wait(500);
    }
  }

  throw new Error(NETWORK_ERROR_MESSAGE);
}
