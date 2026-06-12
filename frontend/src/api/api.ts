export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(
  /\/$/,
  "",
);

export function getApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}