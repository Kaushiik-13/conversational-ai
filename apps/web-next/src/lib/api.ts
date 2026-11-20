export interface ApiFailure {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface AuthProfile {
  user: { id: string; email: string; displayName: string };
  activeContext: {
    organizationId: string;
    organizationCode: string;
    organizationName: string;
    role: string;
  } | null;
  capabilities: string[];
  mustChangePassword: boolean;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") {
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = decodeURIComponent(token);
  }

  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as ApiFailure;
    throw new ApiError(
      failure.error?.message ?? "The request could not be completed.",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthProfile> {
  await apiRequest("/auth/csrf");
  return apiRequest<AuthProfile>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiRequest<AuthProfile>("/auth/password", {
    method: "PUT",
    body: { currentPassword, newPassword },
  });

export const getProfile = () => apiRequest<AuthProfile>("/auth/me");
export const logout = () =>
  apiRequest<void>("/auth/logout", { method: "POST" });
