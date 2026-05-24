import { NextResponse } from "next/server";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { normalizeOutput } from "@/lib/mcp/normalize";

/**
 * Diagnóstico del MCP — lista qué tools expone MM y prueba get_available_sources.
 * Visita /api/mcp/debug en el browser para ver:
 *   - si la sesión OAuth está activa (isLive)
 *   - los nombres exactos de las tools (por si MM las nombra distinto a
 *     lo que asumimos)
 *   - el output crudo de get_available_sources y cómo lo normalizamos
 */
export async function GET(req: Request) {
  const { tools, isLive } = await getMasterMetricsTools(req);
  const toolNames = Object.keys(tools as object);

  if (!isLive) {
    return NextResponse.json({
      isLive: false,
      message: "Sesión OAuth no activa. Las tools que ves son mocks.",
      toolNames,
    });
  }

  // Sample call: get_available_sources
  let sourcesSample: any = null;
  try {
    const t = (tools as any).get_available_sources;
    if (t?.execute) {
      const raw = await t.execute(
        {},
        { toolCallId: "debug-sources", messages: [] }
      );
      sourcesSample = { raw, normalized: normalizeOutput(raw) };
    } else {
      sourcesSample = { error: "tool no expone execute" };
    }
  } catch (e: any) {
    sourcesSample = { error: e?.message ?? String(e) };
  }

  const descriptions: Record<string, string> = {};
  for (const [name, t] of Object.entries(tools as Record<string, any>)) {
    descriptions[name] = String(t?.description ?? "").slice(0, 180);
  }

  return NextResponse.json({
    isLive: true,
    toolNames,
    descriptions,
    get_available_sources_sample: sourcesSample,
  });
}
