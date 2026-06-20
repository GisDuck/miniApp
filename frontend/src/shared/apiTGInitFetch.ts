import { getTelegramInitData } from "./telegram";
import { getApiUrl } from "../api/api"

const TEMP_DEBUG_REQUEST_DELAY_MS = 2500;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function apiTGInitFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  await wait(TEMP_DEBUG_REQUEST_DELAY_MS);

  const headers = new Headers(options.headers);

  const initData = getTelegramInitData();

  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  return fetch(getApiUrl(path), {
    ...options,
    headers,
  });
}
