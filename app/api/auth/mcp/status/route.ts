import { NextResponse } from "next/server";
import { getMCPSession } from "@/lib/mcp/session";

export async function GET() {
  const session = await getMCPSession();
  const now = Math.floor(Date.now() / 1000);
  // We don't refresh here (cookies can only be written in mutating handlers);
  // we just report whether a non-expired session exists. /api/chat will
  // refresh on the next real call if needed.
  const connected = !!session && session.expires_at > now;
  return NextResponse.json({ connected });
}
