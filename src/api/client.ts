/** Browser-safe client for the JAP backend. Keep credentials and ABDM secrets server-side. */
const configuredUrl = import.meta.env.VITE_API_URL?.trim();
const forcedDemo = import.meta.env.VITE_DEMO_MODE?.trim() === "true";

export const apiEnabled = import.meta.env.VITE_DATA_MODE?.trim().toLowerCase() === "api" && Boolean(configuredUrl) && !forcedDemo;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /**
     * Why an authorization denial happened, in the closed §2.5 vocabulary
     * (`consent_pending`, `role_not_permitted`, …). Present on 403s so the UI
     * can explain a refusal instead of guessing — the server decided, the
     * browser renders.
     */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

/** The backend's error envelope (backend/src/middleware/error-schemas.ts). */
type ApiErrorPayload = {
  error?: { message?: string; code?: string; reason?: string; capability?: string };
  message?: string;
};

function endpoint(path: string) {
  if (!path.startsWith("/")) throw new Error("API paths must start with '/'.");
  if (!configuredUrl) throw new Error("VITE_API_URL must be configured when VITE_DATA_MODE=api.");
  return `${configuredUrl.replace(/\/$/, "")}/api/v1${path}`;
}

/** Makes same-site cookie sessions explicit; no tokens are stored in browser storage. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, ...init } = options;
  const response = await fetch(endpoint(path), {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null) as ApiErrorPayload | T | null;
  if (!response.ok) {
    const error = payload as ApiErrorPayload | null;
    throw new ApiError(
      error?.error?.message ?? error?.message ?? `Request failed (${response.status}).`,
      response.status,
      error?.error?.code,
      error?.error?.reason,
    );
  }
  return payload as T;
}
