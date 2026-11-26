export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let clientId: string | undefined;

export function getClientId() {
  return (clientId ??= crypto.randomUUID());
}

function retrySeconds(value: string | null) {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - Date.now()) / 1000))
    : null;
}

export async function apiClient<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
  }: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (method !== "GET") headers.set("X-Client-Id", getClientId());
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      result?.error?.code ?? "REQUEST_FAILED",
      result?.error?.message ?? "Request failed. Try again.",
      retrySeconds(response.headers.get("Retry-After")),
    );
  }
  return response.json();
}
