import { NextResponse } from "next/server";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { MOCK_ACCOUNTS } from "@/lib/mcp/mock-data";
import { extractCollection, normalizeOutput } from "@/lib/mcp/normalize";

/**
 * Normaliza una cuenta cruda del MCP a `{id, name, source, ...}` —
 * el shape que la UI espera.
 *
 * MM la entrega como `{value, label}` (sin currency/status). Nuestros
 * mocks la entregan como `{id, name, source, currency, status}`.
 * Mapeo: id ← value|id, name ← label|name. Source viene de la query.
 */
function normalizeAccount(raw: any, source: string): { id: string; name: string; source: string } & Record<string, unknown> {
  const id = String(raw?.id ?? raw?.value ?? raw?.account_id ?? raw?.accountId ?? "");
  const name = String(raw?.name ?? raw?.label ?? raw?.display_name ?? raw?.displayName ?? id);
  return { ...raw, id, name, source };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const debug = url.searchParams.get("debug") === "1";

  if (!source) {
    return NextResponse.json(
      { accounts: [], error: "Falta el parámetro source" },
      { status: 400 }
    );
  }

  const { tools, isLive } = await getMasterMetricsTools(req);

  if (!isLive) {
    return NextResponse.json({
      accounts: MOCK_ACCOUNTS.filter((a) => a.source === source).map((a) => normalizeAccount(a, source)),
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
    const data = normalizeOutput(raw);
    const accounts = extractCollection(data, "accounts").map((a) => normalizeAccount(a, source));

    // eslint-disable-next-line no-console
    console.log("[/api/mcp/accounts]", source, "→", accounts.length, "cuentas");

    const body: any = { accounts, isLive: true };
    if (debug) body._debug = { raw, normalized: data };
    return NextResponse.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/mcp/accounts] error:", err);
    return NextResponse.json({
      accounts: [],
      isLive: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
