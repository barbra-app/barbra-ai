"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

interface SeriesPoint {
  date: string;
  value: number;
}

interface TimeSeriesData {
  metric: string;
  days: number;
  series: {
    campaignId: string;
    campaignName: string;
    channel?: string;
    points: SeriesPoint[];
  }[];
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function MetricLineChart({ data }: { data: TimeSeriesData }) {
  // Pivot series into a single array of { date, [campaignName]: value }
  const allDates = Array.from(
    new Set(data.series.flatMap((s) => s.points.map((p) => p.date)))
  ).sort();

  const merged = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const s of data.series) {
      const point = s.points.find((p) => p.date === date);
      row[s.campaignName] = point?.value ?? 0;
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
          {data.metric} · daily
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">
          last {data.days} days
        </span>
      </header>
      <div className="h-64 w-full">
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
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="circle"
            />
            {data.series.map((s, i) => (
              <Line
                key={s.campaignId}
                type="monotone"
                dataKey={s.campaignName}
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
