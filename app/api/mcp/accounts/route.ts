import { NextResponse } from "next/server";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { MOCK_ACCOUNTS } from "@/lib/mcp/mock-data";
import { normalizeOutput } from "@/lib/mcp/normalize";

/**
 * Devuelve las cuentas conectadas para una fuente dada. Real si hay
 * sesión OAuth, mock si no.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  if (!source) {
    return NextResponse.json(
      { accounts: [], error: "Falta el parámetro source" },
      { status: 400 }
    );
  }

  const { tools, isLive } = await getMasterMetricsTools(req);

  if (!isLive) {
    return NextResponse.json({
      accounts: MOCK_ACCOUNTS.filter((a) => a.source === source),
      isLive: false,
    });
  }

  try {
    const tool = (tools as Record<string, any>).get_accounts;
    if (!tool?.execute) {
      return NextResponse.json({
        accounts: [],
        isLive: true,
        error: "MM no expone get_accounts",
      });
    }
    const raw = await tool.execute(
      { source },
      { toolCallId: "sidebar-accounts", messages: [] }
    );
    const data = normalizeOutput(raw) as { accounts?: unknown[] } | null;
    return NextResponse.json({
      accounts: Array.isArray(data?.accounts) ? data!.accounts : [],
      isLive: true,
    });
  } catch (err) {
    return NextResponse.json({
      accounts: [],
      isLive: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
