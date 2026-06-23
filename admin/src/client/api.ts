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

export async function apiSend<T>(
  url: string,
  method: string,
  body?: unknown
) {
  const hasBody = body !== undefined && body !== null;
  const isFormData = body instanceof FormData;

  const response = await fetch(url, {
    method,
    credentials: "include",

    headers: !hasBody
      ? undefined
      : isFormData
        ? undefined
        : {
            "Content-Type": "application/json",
          },

    body: !hasBody
      ? undefined
      : isFormData
        ? body
        : JSON.stringify(body),
  });

  return parseResponse<T>(response);
}
