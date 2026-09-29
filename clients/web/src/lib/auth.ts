import { ApiError, oidcRequest, request } from "./api";

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
};

export type Session = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  idToken?: string;
  claims: Record<string, unknown>;
};

type OidcTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
};

type LoginTransaction = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};
const SESSION_KEY = "laundry.web.session.v1";
const LOGIN_KEY = "laundry.web.login.v1";
const issuer = (process.env.NEXT_PUBLIC_OIDC_ISSUER ?? "").replace(/\/$/, "");
const clientId = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "";
const configuredRedirectUri = process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI ?? "";
const audience = process.env.NEXT_PUBLIC_OIDC_AUDIENCE ?? "";
const scope =
  process.env.NEXT_PUBLIC_OIDC_SCOPE ??
  "openid offline_access orders:read orders:write orders:fulfil pickups:read";
const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("laundry-web-session");

function redirectUri(): string {
  return configuredRedirectUri || `${window.location.origin}/callback`;
}

function randomString(bytes = 32): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    return JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStored(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  channel?.postMessage({ type: "session-updated" });
}

export function currentSession(): Session | null {
  return readStored();
}

export function isExpired(session: Session, skewSeconds = 30): boolean {
  return session.expiresAt <= Math.floor(Date.now() / 1000) + skewSeconds;
}

export function roleOf(session: Session): string {
  const roles = session.claims.realm_access;
  if (
    roles &&
    typeof roles === "object" &&
    Array.isArray((roles as { roles?: unknown }).roles)
  ) {
    const known = (roles as { roles: unknown[] }).roles.find(
      (role) => role === "staff" || role === "customer",
    );
    if (typeof known === "string") return known;
  }
  const role = session.claims.role;
  if (role === "staff" || role === "customer") return role;

  // Keycloak emits the effective child roles of a composite actor role in
  // `realm_access.roles`. The capability scopes still identify the actor
  // unambiguously for this client, so use them when the composite name is not
  // present in the token.
  const scopes = new Set(String(session.claims.scope ?? '').split(' '));
  if (scopes.has('orders:fulfil')) return 'staff';
  if (!scopes.has('orders:fulfil')) return 'customer';
  return "customer";
}

export async function beginLogin(
  returnTo = `${window.location.pathname}${window.location.search}`,
): Promise<void> {
  if (!issuer || issuer.includes("example.com") || !clientId)
    throw new Error(
      "OIDC belum dikonfigurasi. Salin .env.example ke .env.local.",
    );
  const discovery = await oidcRequest<Discovery>(
    `${issuer}/.well-known/openid-configuration`,
  );
  const verifier = randomString();
  const transaction: LoginTransaction = {
    state: randomString(),
    nonce: randomString(),
    verifier,
    returnTo,
  };
  sessionStorage.setItem(LOGIN_KEY, JSON.stringify(transaction));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
  });
  if (audience) params.set("audience", audience);
  window.location.replace(
    `${discovery.authorization_endpoint}?${params.toString()}`,
  );
}

export async function completeLogin(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const transaction = JSON.parse(
    sessionStorage.getItem(LOGIN_KEY) ?? "null",
  ) as LoginTransaction | null;
  sessionStorage.removeItem(LOGIN_KEY);
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description");
    throw new Error(
      description
        ? `Login ditolak: ${description}`
        : `Login ditolak (${providerError}).`,
    );
  }
  if (
    !transaction ||
    params.get("state") !== transaction.state ||
    !params.get("code")
  )
    throw new Error("Callback login tidak valid.");
  const discovery = await oidcRequest<Discovery>(
    `${issuer}/.well-known/openid-configuration`,
  );
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code: params.get("code")!,
    redirect_uri: redirectUri(),
    code_verifier: transaction.verifier,
  });
  const tokens = await oidcRequest<OidcTokens>(discovery.token_endpoint, {
    method: "POST",
    body,
  });
  const idClaims = tokens.id_token ? parseJwt(tokens.id_token) : {};
  if (tokens.id_token) {
    const audienceClaim = idClaims.aud;
    const audienceMatches =
      audienceClaim === clientId ||
      (Array.isArray(audienceClaim) && audienceClaim.includes(clientId));
    if (
      idClaims.iss !== issuer ||
      !audienceMatches ||
      idClaims.nonce !== transaction.nonce ||
      (typeof idClaims.exp === "number" &&
        idClaims.exp <= Math.floor(Date.now() / 1000))
    )
      throw new Error("Validasi ID token OIDC gagal.");
  }
  const claims = parseJwt(tokens.access_token);
  writeStored({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: tokens.token_type ?? "Bearer",
    expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    idToken: tokens.id_token,
    claims,
  });
  return transaction.returnTo || "/orders";
}

async function refreshSession(existing: Session): Promise<Session> {
  if (!existing.refreshToken)
    throw new Error("Sesi tidak memiliki refresh token.");
  const discovery = await oidcRequest<Discovery>(
    `${issuer}/.well-known/openid-configuration`,
  );
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: existing.refreshToken,
  });
  const tokens = await oidcRequest<OidcTokens>(discovery.token_endpoint, {
    method: "POST",
    body,
  });
  const session: Session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? existing.refreshToken,
    tokenType: tokens.token_type ?? existing.tokenType,
    expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    idToken: tokens.id_token ?? existing.idToken,
    claims: parseJwt(tokens.access_token),
  };
  writeStored(session);
  return session;
}

export async function validSession(): Promise<Session | null> {
  const session = readStored();
  if (!session) return null;
  if (!isExpired(session)) return session;
  const refresh = async (): Promise<Session> => {
    const latest = readStored();
    if (latest && !isExpired(latest)) return latest;
    try {
      return await refreshSession(latest ?? session);
    } catch (error) {
      clearSession();
      throw error;
    }
  };
  if (navigator.locks?.request)
    return navigator.locks.request("laundry-web-session-refresh", refresh);
  return refresh();
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  channel?.postMessage({ type: "session-cleared" });
}

export async function signOut(onComplete?: () => void): Promise<void> {
  const session = readStored();
  clearSession();
  if (!issuer || !session) {
    onComplete?.();
    return;
  }
  try {
    const discovery = await oidcRequest<Discovery>(
      `${issuer}/.well-known/openid-configuration`,
    );
    if (discovery.revocation_endpoint && session.refreshToken) {
      await oidcRequest(discovery.revocation_endpoint, {
        method: "POST",
        body: new URLSearchParams({
          token: session.refreshToken,
          token_type_hint: "refresh_token",
          client_id: clientId,
        }),
      });
    }
  } catch {
    // Local session is already cleared; a provider outage must not trap the
    // user on the identity server during sign-out.
  }
  onComplete?.();
}

export async function authenticatedRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
) {
  const session = await validSession();
  if (!session)
    throw new ApiError(401, {
      title: "Sign in required",
      detail: "Login diperlukan.",
    });
  try {
    return await request<T>(path, options, session.accessToken);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      retry &&
      session.refreshToken
    ) {
      await validSession();
      return authenticatedRequest<T>(path, options, false);
    }
    throw error;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY || event.key === null)
      window.dispatchEvent(new CustomEvent("session-changed"));
  });
  channel?.addEventListener("message", () =>
    window.dispatchEvent(new CustomEvent("session-changed")),
  );
}
