export interface ApiFailure {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface MembershipProfile {
  membershipId: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  role: string;
  isDefault: boolean;
  isSelected: boolean;
}

export interface AuthProfile {
  user: { id: string; email: string; displayName: string };
  activeContext: {
    organizationId: string;
    organizationCode: string;
    organizationName: string;
    membershipId: string;
    role: string;
  } | null;
  memberships: MembershipProfile[];
  capabilities: string[];
  mustChangePassword: boolean;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export interface ApiResult<T, M = Record<string, unknown>> {
  data: T;
  meta: M & { requestId?: string };
}

export async function apiRequestFull<T, M = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T, M>> {
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
    signal: init.signal,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as ApiFailure;
    const fallback =
      response.status >= 500
        ? "The server took too long or could not be reached. Please try again."
        : "The request could not be completed.";
    throw new ApiError(
      failure.error?.message ?? fallback,
      response.status,
      failure.error?.code,
    );
  }
  if (response.status === 204)
    return { data: undefined as T, meta: {} as M & { requestId?: string } };
  return (await response.json()) as ApiResult<T, M>;
}

export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  return (await apiRequestFull<T>(path, init)).data;
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

export const selectOrganization = (organizationId: string) =>
  apiRequest<AuthProfile>("/auth/organization-context", {
    method: "PUT",
    body: { organizationId },
  });
