/**
 * Sesión MCP — guarda los tokens OAuth del usuario en una cookie
 * httpOnly. Para una app single-user esto basta; si después quieres
 * multi-usuario en producción, mueve esto a una tabla por user_id.
 */

import { cookies } from "next/headers";
import { refreshTokens, redirectUriFromRequest } from "@/lib/mcp/oauth";

const SESSION_COOKIE = "mm_session";
const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 días (igual al refresh_token expiry)

const PKCE_COOKIE = "mm_pkce";
const PKCE_TTL_S = 10 * 60; // 10 min para completar el ida-vuelta

export interface MCPSession {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch seconds
}

export interface PKCEState {
  verifier: string;
  state: string;
}

// ─── Session (tokens) ────────────────────────────────────────────────

export async function getMCPSession(): Promise<MCPSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MCPSession;
  } catch {
    return null;
  }
}

export async function setMCPSession(session: MCPSession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export async function clearMCPSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Returns a usable access token, auto-refreshing if it's within 60s of
 * expiry. Returns null if there's no session or refresh fails — caller
 * should fall back to mock data in that case.
 *
 * Requires a Request so we can derive the redirect_uri for the refresh
 * call (must match what was used at registration).
 */
export async function getValidAccessToken(req: Request): Promise<string | null> {
  const session = await getMCPSession();
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return session.access_token;

  if (!session.refresh_token) {
    await clearMCPSession();
    return null;
  }

  try {
    const fresh = await refreshTokens(session.refresh_token, redirectUriFromRequest(req));
    const updated: MCPSession = {
      access_token: fresh.access_token,
      // MM rotates refresh tokens on every use — keep the new one
      refresh_token: fresh.refresh_token ?? session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + fresh.expires_in,
    };
    await setMCPSession(updated);
    return updated.access_token;
  } catch {
    await clearMCPSession();
    return null;
  }
}

// ─── PKCE state (verifier + CSRF state, short-lived) ─────────────────

export async function setPKCEState(pkce: PKCEState): Promise<void> {
  const store = await cookies();
  store.set(PKCE_COOKIE, JSON.stringify(pkce), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PKCE_TTL_S,
  });
}

export async function popPKCEState(): Promise<PKCEState | null> {
  const store = await cookies();
  const raw = store.get(PKCE_COOKIE)?.value;
  store.delete(PKCE_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PKCEState;
  } catch {
    return null;
  }
}
