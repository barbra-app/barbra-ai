import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  generatePKCE,
  generateState,
  getOrRegisterClient,
  redirectUriFromRequest,
} from "@/lib/mcp/oauth";
import { setPKCEState } from "@/lib/mcp/session";

/**
 * Inicia el flujo OAuth contra Master Metrics.
 *
 * 1. Asegura que la app está registrada con MM (DCR si es primera vez).
 * 2. Genera PKCE verifier + challenge.
 * 3. Genera state para protección CSRF.
 * 4. Guarda verifier + state en cookie httpOnly de corta vida.
 * 5. Redirige al endpoint /oauth/authorize de MM.
 */
export async function GET(req: Request) {
  try {
    const redirectUri = redirectUriFromRequest(req);
    const client = await getOrRegisterClient(redirectUri);
    const { verifier, challenge } = generatePKCE();
    const state = generateState();

    await setPKCEState({ verifier, state });

    const authorizeUrl = await buildAuthorizeUrl({
      clientId: client.client_id,
      redirectUri,
      codeChallenge: challenge,
      state,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const origin = new URL(req.url).origin;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${origin}/?mm_error=${encodeURIComponent(msg)}`);
  }
}
