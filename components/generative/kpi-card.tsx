import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface KpiSummary {
  label: string;
  days: number;
  kpis: {
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cvr: number;
    cpa: number;
    roas: number;
  };
}

export function KpiSummary({ data }: { data: KpiSummary }) {
  const k = data.kpis;
  const cards = [
    { label: "Spend", value: formatCurrency(k.spend), tone: "default" },
    { label: "Revenue", value: formatCurrency(k.revenue), tone: "default" },
    { label: "ROAS", value: `${k.roas.toFixed(2)}×`, tone: k.roas >= 2 ? "good" : "warn" },
    { label: "CPA", value: formatCurrency(k.cpa), tone: "default" },
    { label: "Conv.", value: formatNumber(k.conversions), tone: "default" },
    { label: "CTR", value: formatPercent(k.ctr, 2), tone: "default" },
    { label: "CVR", value: formatPercent(k.cvr, 2), tone: "default" },
    { label: "Clicks", value: formatNumber(k.clicks), tone: "default" },
  ] as const;

  return (
    <div className="my-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3
          className="text-[13px] font-medium text-[var(--color-fg)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {data.label}
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">
          last {data.days} days
        </span>
      </header>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c) => (
          <Card key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "good" | "warn";
}) {
  const accent =
    tone === "good"
      ? "text-[var(--color-brand-sage)]"
      : tone === "warn"
        ? "text-[var(--color-brand-spark)]"
        : "text-[var(--color-fg)]";
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </div>
      <div
        className={`text-[18px] font-semibold tabular-nums ${accent}`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
    </div>
  );
}
