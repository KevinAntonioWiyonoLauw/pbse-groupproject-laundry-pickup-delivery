export type ProblemDetail = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  invalidFields?: string[];
  "invalid-params"?: Array<{ name: string; reason: string }>;
  currentStatus?: string;
  allowedStatuses?: string[];
};

export type ApiResult<T> = {
  data: T | null;
  status: number;
  etag: string | null;
  nextCursor: string | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail | null;

  constructor(status: number, problem: ProblemDetail | null, message?: string) {
    super(message ?? problem?.detail ?? `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/v1"
).replace(/\/$/, "");

async function readProblem(response: Response): Promise<ProblemDetail | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as ProblemDetail) : null;
  } catch {
    return null;
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok && response.status !== 304) {
    throw new ApiError(response.status, await readProblem(response));
  }
  const data =
    response.status === 204 || response.status === 304
      ? null
      : ((await response.json()) as T);
  return {
    data,
    status: response.status,
    etag: response.headers.get("ETag"),
    nextCursor: response.headers.get("X-Next-Cursor"),
  };
}

export async function oidcRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      null,
      "Authorization server tidak dapat dijangkau. Periksa NEXT_PUBLIC_OIDC_ISSUER dan pastikan Keycloak sedang berjalan.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      await readProblem(response),
      "OIDC request failed",
    );
  return (await response.json()) as T;
}

export function apiBaseUrl(): string {
  return API_BASE_URL;
}
