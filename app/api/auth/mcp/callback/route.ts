import { NextResponse } from "next/server";
import { exchangeCode, redirectUriFromRequest } from "@/lib/mcp/oauth";
import { popPKCEState, setMCPSession } from "@/lib/mcp/session";

/**
 * Recibe el callback OAuth de Master Metrics. Valida el state contra el
 * que guardamos en la cookie PKCE, intercambia el code por tokens, y
 * los persiste en la cookie de sesión.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const msg = errorDescription ?? error;
    return NextResponse.redirect(`${url.origin}/?mm_error=${encodeURIComponent(msg)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${url.origin}/?mm_error=missing_params`);
  }

  const pkce = await popPKCEState();
  if (!pkce || pkce.state !== state) {
    return NextResponse.redirect(`${url.origin}/?mm_error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code, pkce.verifier, redirectUriFromRequest(req));
    await setMCPSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });
    return NextResponse.redirect(`${url.origin}/?mm_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${url.origin}/?mm_error=${encodeURIComponent(msg)}`);
  }
}
