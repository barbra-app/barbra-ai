/**
 * Wrapper para get_data del MCP de Master Metrics.
 *
 * MM devuelve los resultados de get_data como un array de arrays
 * posicional (no como objetos), con los números serializados como
 * strings:
 *
 *   [["BFL_ElenaRose_Feb2026_V2","18-24","female","56358","23554", ...], ...]
 *
 * El orden de columnas es `[...breakdowns, ...metrics]` siguiendo los
 * args del request. Sin convertir esto a objetos con keys reales y
 * números parseados, la UI no puede renderizar chart/tabla/KPIs (ve
 * columnas "0","1","2" y todos los valores como strings).
 *
 * Además: queries con cross-product de varias dimensiones producen
 * cientos de filas. Pasarle todo eso a Claude vacía el rate limit
 * (10K input tokens/min en tier 1). Truncamos a 50 filas ordenadas
 * por la primera métrica desc, preservando los totales para que
 * Claude pueda contextualizar.
 */

import { normalizeOutput } from "@/lib/mcp/normalize";

const MAX_ROWS_TO_MODEL = 50;

interface GetDataArgs {
  source: string;
  metrics?: string[];
  breakdowns?: string[];
  accounts?: string[];
  since?: string;
  until?: string;
  tileData?: boolean;
}

interface CompactGetDataResult {
  columns: string[];
  rows: Record<string, string | number>[];
  totalRows: number;
  truncated: boolean;
  totals: Record<string, number>;
  meta: {
    source: string;
    accounts?: string[];
    since?: string;
    until?: string;
    tileData?: boolean;
  };
}

/**
 * Wrap get_data tool to normalize its output. Returns a new tool with
 * the same shape but a smarter execute.
 */
export function wrapGetData(tool: any): any {
  if (!tool || typeof tool.execute !== "function") return tool;
  const original = tool.execute.bind(tool);

  return {
    ...tool,
    execute: async (args: GetDataArgs, ctx: unknown) => {
      const raw = await original(args, ctx);
      try {
        return compactGetDataResult(raw, args);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[get-data-wrapper] compact failed, returning raw:", e);
        return raw;
      }
    },
  };
}

function compactGetDataResult(raw: unknown, args: GetDataArgs): CompactGetDataResult | unknown {
  const data = normalizeOutput(raw);

  // Si no es un array, dejamos pasar (puede ser un error o un shape
  // distinto que no entendemos — DataResult tiene su propio fallback).
  if (!Array.isArray(data)) return data;

  const breakdowns = args.breakdowns ?? [];
  const metrics = args.metrics ?? [];
  const columns = [...breakdowns, ...metrics];

  // Convertir cada fila posicional → objeto con keys reales y números
  // parseados.
  const allRows: Record<string, string | number>[] = data.map((row: any) => {
    const obj: Record<string, string | number> = {};
    if (Array.isArray(row)) {
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = parseValue(row[i]);
      }
    } else if (row && typeof row === "object") {
      // Por si MM cambia el formato y devuelve objetos directos
      for (const k of Object.keys(row)) obj[k] = parseValue(row[k]);
    }
    return obj;
  });

  // Totales (sobre TODAS las filas, no las truncadas) — para que Claude
  // tenga el panorama completo aunque solo vea 50 filas.
  const totals: Record<string, number> = {};
  for (const m of metrics) {
    let sum = 0;
    for (const r of allRows) {
      const v = r[m];
      if (typeof v === "number") sum += v;
    }
    totals[m] = round(sum);
  }

  // Ordenar por primera métrica desc, truncar
  if (metrics.length > 0 && allRows.length > MAX_ROWS_TO_MODEL) {
    const sortKey = metrics[0];
    allRows.sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }

  const rows = allRows.slice(0, MAX_ROWS_TO_MODEL);
  const truncated = allRows.length > MAX_ROWS_TO_MODEL;

  return {
    columns,
    rows,
    totalRows: allRows.length,
    truncated,
    totals,
    meta: {
      source: args.source,
      accounts: args.accounts,
      since: args.since,
      until: args.until,
      tileData: args.tileData,
    },
  };
}

function parseValue(v: unknown): string | number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return String(v ?? "");
  // Strings vacíos quedan como ""
  if (v === "") return "";
  // Intentar parsear como número (MM serializa numbers como strings)
  const n = Number(v);
  if (!Number.isNaN(n) && Number.isFinite(n) && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) {
    return n;
  }
  return v;
}

function round(n: number, places = 2): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
