import { NextResponse } from "next/server";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { MOCK_SOURCES } from "@/lib/mcp/mock-data";
import { extractCollection, normalizeOutput } from "@/lib/mcp/normalize";

/**
 * Mapeo de nombres de fuente a su capitalización "bonita". MM devuelve
 * todo en mayúsculas ("META", "GOOGLE"), nosotros mostramos algo más
 * humano. Si MM agrega una fuente nueva que no esté aquí, caemos a
 * titlecase del label upstream.
 *
 * Lista basada en la doc oficial de MM:
 * meta, google, google_analytics, linkedin, tiktok, youtube, shopify,
 * kommo, pipedrive, gohighlevel, close, tiendanube, marketingnube
 */
const PRETTY_SOURCE: Record<string, string> = {
  meta: "Meta",
  google: "Google Ads",
  google_analytics: "Google Analytics",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  shopify: "Shopify",
  kommo: "Kommo",
  pipedrive: "Pipedrive",
  gohighlevel: "GoHighLevel",
  close: "Close",
  tiendanube: "Tiendanube",
  marketingnube: "Marketingnube",
};

function prettyName(raw: { name?: string; label?: string }): string {
  const key = (raw.name ?? "").toLowerCase();
  if (key && PRETTY_SOURCE[key]) return PRETTY_SOURCE[key];
  const src = raw.label ?? raw.name ?? "";
  return src ? src.charAt(0).toUpperCase() + src.slice(1).toLowerCase() : "";
}

/**
 * Normaliza una fuente cruda del MCP a `{id, name, ...}` — el shape que
 * la UI espera. MM la entrega como `{name, label}`; nuestros mocks como
 * `{name, label}` también. `id` queda como el identificador canónico
 * (lo que MM llama `name`: "meta", "google", …) y `name` queda como la
 * versión bonita ("Meta", "Google", "TikTok").
 */
function normalizeSource(raw: any): { id: string; name: string } & Record<string, unknown> {
  const id = String(raw?.id ?? raw?.name ?? raw?.value ?? raw?.key ?? "");
  const name = prettyName({ name: raw?.name ?? raw?.id, label: raw?.label ?? raw?.displayName });
  return { ...raw, id, name };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const { tools, isLive } = await getMasterMetricsTools(req);

  if (!isLive) {
    return NextResponse.json({
      sources: MOCK_SOURCES.map(normalizeSource),
      isLive: false,
    });
  }

  try {
    const tool = (tools as Record<string, any>).get_available_sources;
    if (!tool?.execute) {
      return NextResponse.json({
        sources: [],
        isLive: true,
        error: `MM no expone get_available_sources. Tools: ${Object.keys(tools as object).join(", ")}`,
      });
    }
    const raw = await tool.execute({}, { toolCallId: "sidebar-sources", messages: [] });
    const data = normalizeOutput(raw);
    const sources = extractCollection(data, "sources").map(normalizeSource);

    // eslint-disable-next-line no-console
    console.log("[/api/mcp/sources]", sources.length, "sources →", sources.map(s => s.id).join(", "));

    const body: any = { sources, isLive: true };
    if (debug) body._debug = { raw, normalized: data };
    return NextResponse.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/mcp/sources] error:", err);
    return NextResponse.json({
      sources: [],
      isLive: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
