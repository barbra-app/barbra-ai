"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { extractRows } from "@/lib/mcp/normalize";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

/**
 * Render whatever get_data returned. Three modes:
 *
 *  1. tileData → one totals row with only metrics → KPI tile grid.
 *  2. Has a `date` column + 1+ numeric columns → line chart, optionally
 *     multi-series (one line per breakdown value).
 *  3. Otherwise → flat table.
 *
 * Defensive against shape drift: extractRows() tries rows/data/items/results.
 */

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const METRIC_FORMAT: Record<string, (n: number) => string> = {
  spend: (n) => formatCurrency(n),
  revenue: (n) => formatCurrency(n),
  cpc: (n) => formatCurrency(n),
  cpa: (n) => formatCurrency(n),
  cpm: (n) => formatCurrency(n),
  aov: (n) => formatCurrency(n),
  ctr: (n) => formatPercent(n, 2),
  cvr: (n) => formatPercent(n, 2),
  roas: (n) => `${n.toFixed(2)}×`,
};

function formatMetric(name: string, value: number) {
  return (METRIC_FORMAT[name] ?? formatNumber)(value);
}

export function DataResult({ output }: { output: any }) {
  const rows = useMemo(() => extractRows(output) ?? [], [output]);

  if (!rows.length) {
    return (
      <div className="my-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-[12px] text-[var(--color-fg-muted)]">
        Esta consulta no devolvió resultados.
      </div>
    );
  }

  // Figure out which columns are numeric (metrics) vs categorical (dimensions).
  const columns = Object.keys(rows[0]);
  const metricCols = columns.filter((c) => typeof rows[0][c] === "number");
  const dimCols = columns.filter((c) => typeof rows[0][c] !== "number");
  const tileData = output?.tileData === true || (rows.length === 1 && dimCols.length === 0);
  const hasDate = dimCols.includes("date");
  const breakdownCol = dimCols.find((c) => c !== "date");

  if (tileData) return <TileGrid row={rows[0]} metrics={metricCols} />;
  if (hasDate && metricCols.length > 0) {
    return <ChartView rows={rows} metrics={metricCols} breakdownCol={breakdownCol} />;
  }
  return <TableView rows={rows} columns={columns} metricCols={metricCols} />;
}

// ─── Tile / KPI grid (tileData = true) ───────────────────────────────

function TileGrid({ row, metrics }: { row: Record<string, any>; metrics: string[] }) {
  return (
    <div className="my-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 md:p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m}
            className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5"
          >
            <div className="mb-1 truncate text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {m}
            </div>
            <div
              className="truncate text-[16px] font-semibold tabular-nums text-[var(--color-fg)] md:text-[18px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatMetric(m, Number(row[m]) || 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Line chart view ─────────────────────────────────────────────────

function ChartView({
  rows,
  metrics,
  breakdownCol,
}: {
  rows: Record<string, any>[];
  metrics: string[];
  breakdownCol?: string;
}) {
  // Primary metric for now — the first one. (Could expose a metric switcher.)
  const metric = metrics[0];

  // Pivot: rows → { date, [series]: value }
  const dates = Array.from(new Set(rows.map((r) => String(r.date)))).sort();
  const seriesKeys = breakdownCol
    ? Array.from(new Set(rows.map((r) => String(r[breakdownCol]))))
    : [metric];

  const merged = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    if (breakdownCol) {
      for (const key of seriesKeys) {
        const match = rows.find((r) => r.date === date && r[breakdownCol] === key);
        row[key] = match ? Number(match[metric]) || 0 : 0;
      }
    } else {
      row[metric] = Number(rows.find((r) => r.date === date)?.[metric]) || 0;
    }
    return row;
  });

  return (
    <div className="my-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3
          className="text-[13px] font-medium capitalize text-[var(--color-fg)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {metric} {breakdownCol ? `· por ${breakdownCol}` : ""}
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">
          {dates.length} día{dates.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="h-56 w-full md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--color-fg-subtle)"
              tick={{ fontSize: 10 }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              stroke="var(--color-fg-subtle)"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-fg-muted)" }}
            />
            {breakdownCol && (
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
            )}
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Table view ──────────────────────────────────────────────────────

function TableView({
  rows,
  columns,
  metricCols,
}: {
  rows: Record<string, any>[];
  columns: string[];
  metricCols: string[];
}) {
  const SHOW = 12;
  const shown = rows.slice(0, SHOW);
  const more = rows.length - shown.length;
  return (
    <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-[var(--color-bg-elev)]">
            <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={i}
                className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-elev-2)]"
              >
                {columns.map((c) => {
                  const v = r[c];
                  const isMetric = metricCols.includes(c);
                  return (
                    <td
                      key={c}
                      className={`whitespace-nowrap px-3 py-2 ${
                        isMetric
                          ? "text-right tabular-nums text-[var(--color-fg)]"
                          : "text-[var(--color-fg-muted)]"
                      }`}
                    >
                      {isMetric ? formatMetric(c, Number(v) || 0) : String(v ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && (
        <div className="border-t border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-fg-subtle)]">
          + {more} fila{more === 1 ? "" : "s"} más
        </div>
      )}
    </div>
  );
}
