import { NextResponse } from "next/server";
import { redirectUriFromRequest, revokeToken } from "@/lib/mcp/oauth";
import { clearMCPSession, getMCPSession } from "@/lib/mcp/session";

export async function POST(req: Request) {
  const session = await getMCPSession();
  if (session?.access_token) {
    await revokeToken(session.access_token, redirectUriFromRequest(req)).catch(
      () => void 0
    );
  }
  await clearMCPSession();
  return NextResponse.json({ ok: true });
}
