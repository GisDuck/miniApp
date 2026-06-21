import { getTelegramInitData } from "./telegram";
import { getApiUrl } from "../api/api"

export async function apiTGInitFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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
