import { NextResponse } from "next/server";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { MOCK_SOURCES } from "@/lib/mcp/mock-data";
import { normalizeOutput } from "@/lib/mcp/normalize";

/**
 * Devuelve la lista de fuentes del MCP real si hay sesión OAuth activa,
 * o la lista de mocks si no. El sidebar la consume al montar y cada vez
 * que cambia el estado de conexión.
 */
export async function GET(req: Request) {
  const { tools, isLive } = await getMasterMetricsTools(req);

  if (!isLive) {
    return NextResponse.json({ sources: MOCK_SOURCES, isLive: false });
  }

  try {
    const tool = (tools as Record<string, any>).get_available_sources;
    if (!tool?.execute) {
      return NextResponse.json({
        sources: [],
        isLive: true,
        error: "MM no expone get_available_sources",
      });
    }
    const raw = await tool.execute(
      {},
      { toolCallId: "sidebar-sources", messages: [] }
    );
    const data = normalizeOutput(raw) as { sources?: unknown[] } | null;
    return NextResponse.json({
      sources: Array.isArray(data?.sources) ? data!.sources : [],
      isLive: true,
    });
  } catch (err) {
    return NextResponse.json({
      sources: [],
      isLive: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
