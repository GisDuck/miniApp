async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Ошибка запроса");
  }

  return payload as T;
}

export async function apiGet<T>(url: string) {
  const response = await fetch(url, {
    credentials: "include",
  });

  return parseResponse<T>(response);
}

export async function apiSend<T>(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers:
      body instanceof FormData
        ? undefined
        : {
            "Content-Type": "application/json",
          },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse<T>(response);
}
