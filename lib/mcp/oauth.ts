/**
 * OAuth 2.1 + PKCE client para el MCP de Master Metrics.
 *
 * Implementa:
 *   - Discovery (RFC 8414): /.well-known/oauth-authorization-server
 *   - Dynamic Client Registration (RFC 7591): /oauth/register
 *   - Authorization Code flow con PKCE S256 (RFC 6749 + RFC 7636)
 *   - Token refresh con rotación de refresh_token
 *   - Token revocation (RFC 7009)
 *
 * Los endpoints OAuth viven en la raíz de api.mastermetrics.com (NO bajo
 * /api/v2 — eso es solo para el MCP en sí). Pero en lugar de hardcodear,
 * leemos discovery.
 */

import { createHash, randomBytes } from "node:crypto";

const MM_ROOT =
  process.env.MASTERMETRICS_OAUTH_ROOT ?? "https://api.mastermetrics.com";

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface MMClient {
  client_id: string;
  client_secret?: string;
}

// ─── Caches (process-lifetime) ───────────────────────────────────────

let discoveryCache: AuthServerMetadata | null = null;
const clientByRedirect = new Map<string, MMClient>();

// ─── Discovery ───────────────────────────────────────────────────────

export async function getDiscovery(): Promise<AuthServerMetadata> {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`${MM_ROOT}/.well-known/oauth-authorization-server`);
  if (!res.ok) {
    throw new Error(`OAuth discovery failed: ${res.status} ${await res.text()}`);
  }
  discoveryCache = (await res.json()) as AuthServerMetadata;
  return discoveryCache;
}

// ─── Dynamic Client Registration ─────────────────────────────────────

export async function getOrRegisterClient(redirectUri: string): Promise<MMClient> {
  const cached = clientByRedirect.get(redirectUri);
  if (cached) return cached;

  // Allow pinning via env (one-time DCR then put client_id in env to avoid
  // re-registering on every serverless cold start).
  if (process.env.MASTERMETRICS_CLIENT_ID) {
    const c: MMClient = {
      client_id: process.env.MASTERMETRICS_CLIENT_ID,
      client_secret: process.env.MASTERMETRICS_CLIENT_SECRET,
    };
    clientByRedirect.set(redirectUri, c);
    return c;
  }

  const discovery = await getDiscovery();
  if (!discovery.registration_endpoint) {
    throw new Error(
      "Master Metrics OAuth server does not advertise a registration_endpoint — can't do DCR"
    );
  }

  const res = await fetch(discovery.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Barbra",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client — PKCE secures it
    }),
  });

  if (!res.ok) {
    throw new Error(`DCR failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { client_id: string; client_secret?: string };
  const client: MMClient = {
    client_id: data.client_id,
    client_secret: data.client_secret,
  };
  clientByRedirect.set(redirectUri, client);
  return client;
}

// ─── PKCE ────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return base64url(randomBytes(16));
}

// ─── Authorization URL ───────────────────────────────────────────────

export async function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): Promise<string> {
  const discovery = await getDiscovery();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    state: opts.state,
  });
  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

// ─── Token exchange ──────────────────────────────────────────────────

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const discovery = await getDiscovery();
  const client = await getOrRegisterClient(redirectUri);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: client.client_id,
    code_verifier: codeVerifier,
  });
  if (client.client_secret) body.set("client_secret", client.client_secret);

  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthTokens;
}

export async function refreshTokens(
  refreshToken: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const discovery = await getDiscovery();
  const client = await getOrRegisterClient(redirectUri);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: client.client_id,
  });
  if (client.client_secret) body.set("client_secret", client.client_secret);

  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthTokens;
}

export async function revokeToken(token: string, redirectUri: string): Promise<void> {
  const discovery = await getDiscovery();
  if (!discovery.revocation_endpoint) return;
  const client = await getOrRegisterClient(redirectUri);
  const body = new URLSearchParams({
    token,
    client_id: client.client_id,
  });
  if (client.client_secret) body.set("client_secret", client.client_secret);
  await fetch(discovery.revocation_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).catch(() => void 0);
}

// ─── Redirect URI helper ─────────────────────────────────────────────

export function redirectUriFromRequest(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  const base = explicit && explicit.length > 0 ? explicit : new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/auth/mcp/callback`;
}
