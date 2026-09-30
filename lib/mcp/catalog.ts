/**
 * Pre-carga del catálogo (metrics + dimensions) de Master Metrics para
 * una source dada, e inyección compacta en el system prompt.
 *
 * Sin esto, Claude tiene que llamar get_metrics/get_dimensions cada vez
 * que escoge una métrica, lo que (a) tarda, (b) devuelve respuestas
 * gigantes (~28K chars para Meta), (c) quema input tokens del rate
 * limit de Anthropic, y (d) hace que Claude adivine nombres y MM
 * rechace ("Metric selected not available", "Criteria X not registered").
 *
 * Con esto: una sola fetch por turno, y Claude ya sabe qué nombres son
 * válidos antes de armar el query.
 */

import { extractCollection, normalizeOutput } from "@/lib/mcp/normalize";

export interface CatalogItem {
  name: string;
  label?: string;
}

export interface Catalog {
  metrics: CatalogItem[];
  dimensions: CatalogItem[];
}

function toItem(raw: any): CatalogItem {
  return {
    name: String(raw?.name ?? raw?.value ?? raw?.id ?? ""),
    label: raw?.label ?? raw?.displayName,
  };
}

/**
 * Fetches the catalog for a source. Receives an already-resolved tools
 * map so we don't open a second MCP client.
 *
 * IMPORTANTE: `accounts` es opcional en get_metrics/get_dimensions pero
 * en la práctica las métricas y dimensiones disponibles VARÍAN por
 * cuenta dentro del mismo source (la doc oficial dice "Optional account
 * IDs — needed for some sources like Shopify or GoHighLevel" pero
 * también para Meta hemos visto dimensiones que están en una cuenta y
 * no en otra). Si tenemos accountIds en contexto los pasamos siempre
 * para obtener la lista exacta de esa cuenta.
 */
export async function fetchCatalog(
  tools: Record<string, any>,
  source: string,
  accounts?: string[]
): Promise<Catalog> {
  const getMetrics = tools.get_metrics;
  const getDimensions = tools.get_dimensions;
  const args: { source: string; accounts?: string[] } = { source };
  if (accounts && accounts.length > 0) args.accounts = accounts;

  const [metricsRaw, dimensionsRaw] = await Promise.all([
    getMetrics?.execute
      ? getMetrics
          .execute(args, { toolCallId: "catalog-metrics", messages: [] })
          .catch(() => null)
      : Promise.resolve(null),
    getDimensions?.execute
      ? getDimensions
          .execute(args, { toolCallId: "catalog-dimensions", messages: [] })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const metricsData = metricsRaw ? normalizeOutput(metricsRaw) : null;
  const dimensionsData = dimensionsRaw ? normalizeOutput(dimensionsRaw) : null;

  return {
    metrics: extractCollection(metricsData, "metrics").map(toItem).filter((m) => m.name),
    dimensions: extractCollection(dimensionsData, "dimensions").map(toItem).filter((d) => d.name),
  };
}

/**
 * Render the catalog as a compact string suitable for embedding in the
 * system prompt. We send only the `name` field (no labels) to keep token
 * usage minimal — Meta has ~600 metrics, so even compact JSON would be
 * several thousand tokens.
 */
export function formatCatalogForPrompt(source: string, catalog: Catalog): string {
  const m = catalog.metrics.map((x) => x.name).join(", ");
  const d = catalog.dimensions.map((x) => x.name).join(", ");
  return `\nMétricas válidas para source=${source} (usa EXACTAMENTE estos nombres en get_data):
${m || "(no disponibles)"}

Dimensiones válidas para source=${source} (usa EXACTAMENTE estos nombres en breakdowns):
${d || "(no disponibles)"}\n`;
}
