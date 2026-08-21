const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL;

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!backendBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const response = await fetch(
    `${backendBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
    options
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}
