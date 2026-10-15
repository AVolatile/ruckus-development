export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiClientError(
      "NETWORK_ERROR",
      "Couldn’t reach Ruckus. Check your connection and try again.",
    );
  }
  if (response.status === 204) return undefined as T;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiClientError(
      "INVALID_RESPONSE",
      "Ruckus returned an unreadable response. Try again shortly.",
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/api/v1"))
      window.dispatchEvent(new Event("ruckus:auth-expired"));
    throw new ApiClientError(
      data.error?.code || data.code || "REQUEST_FAILED",
      data.error?.message ||
        data.message ||
        "That request didn’t finish. Try again.",
      response.status,
      data.error?.details,
    );
  }
  return data as T;
}
