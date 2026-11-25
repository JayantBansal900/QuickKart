export const TOKEN_KEY = "quickkart_token";
export const SESSION_INVALID = "quickkart:session-invalid";
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function invalidateSession(token: string) {
  if (localStorage.getItem(TOKEN_KEY) !== token) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("quickkart_user");
  window.dispatchEvent(new Event(SESSION_INVALID));
}
const requests = new WeakMap<Response, string | null>();
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token =
    new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "") ||
    null;
  try {
    const response = await fetch(url, {
      ...init,
      // Always keep the 15 s timeout, even when the caller also passes its own cancel signal.
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (token && localStorage.getItem(TOKEN_KEY) !== token)
      throw new ApiError("Session changed. Please try again.", 409);
    requests.set(response, token);
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof DOMException &&
      ["TimeoutError", "AbortError"].includes(error.name)
        ? "Request timed out or was cancelled. Check the result before submitting again."
        : "Unable to reach VAYU. Please check your connection and try again.",
      0,
    );
  }
}
export async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const requestToken = requests.get(response);
  if (requestToken && localStorage.getItem(TOKEN_KEY) !== requestToken)
    throw new ApiError("Session changed. Please try again.", 409);
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const token = requests.get(response);
    if (token && response.status === 401) invalidateSession(token);
    // Some Spring services return 403 for anonymous requests. Confirm identity before logging out.
    if (token && response.status === 403) {
      try {
        const profile = await fetch(`${API_BASE_URL}/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });
        if (profile.status === 401) invalidateSession(token);
      } catch {
        /* A transport outage is not proof of invalid credentials. */
      }
    }
    const record =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : response.status === 429
            ? "Too many attempts. Please wait before trying again."
            : `Request failed (${response.status}). Please try again.`;
    const retry = Number(response.headers.get("Retry-After"));
    throw new ApiError(message, response.status, retry > 0 ? retry : undefined);
  }
  if (!text) return undefined as T;
  if (body === undefined)
    throw new ApiError(
      "The server returned an unreadable response.",
      response.status,
    );
  return body as T;
}
