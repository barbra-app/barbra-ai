import type { MMDimension, MMMetric } from "@/lib/mcp/mock-data";

interface Props {
  kind: "metrics" | "dimensions" | "dates";
  items: Array<MMMetric | MMDimension | { name: string; label?: string }>;
}

const KIND_LABEL: Record<Props["kind"], { singular: string; plural: string }> = {
  metrics: { singular: "métrica", plural: "métricas" },
  dimensions: { singular: "dimensión", plural: "dimensiones" },
  dates: { singular: "fecha", plural: "fechas" },
};

const KIND_EMPTY: Record<Props["kind"], string> = {
  metrics: "No hay métricas disponibles para esta fuente.",
  dimensions: "No hay dimensiones disponibles para esta fuente.",
  dates: "No hay campos de fecha disponibles para esta fuente.",
};

const TYPE_BADGE: Record<string, string> = {
  currency: "bg-[var(--color-brand-cta)]/12 text-[var(--color-brand-cta)]",
  number: "bg-[var(--color-fg-muted)]/10 text-[var(--color-fg-muted)]",
  percent: "bg-[var(--color-brand-spark)]/15 text-[var(--color-brand-spark)]",
  ratio: "bg-[var(--color-brand-sage)]/15 text-[var(--color-brand-sage)]",
};

export function DiscoveryChips({ kind, items }: Props) {
  if (!items?.length) {
    return (
      <div className="my-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-[12px] text-[var(--color-fg-muted)]">
        {KIND_EMPTY[kind]}
      </div>
    );
  }
  const label = items.length === 1 ? KIND_LABEL[kind].singular : KIND_LABEL[kind].plural;
  return (
    <div className="my-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {items.length} {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const type = "type" in item ? (item.type as string | undefined) : undefined;
          return (
            <span
              key={item.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2.5 py-1 text-[11.5px] text-[var(--color-fg-muted)]"
            >
              <span className="text-[var(--color-fg)]">{item.label ?? item.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
                {item.name}
              </span>
              {type && (
                <span
                  className={`rounded px-1.5 py-px text-[9px] font-medium uppercase tracking-wider ${TYPE_BADGE[type] ?? ""}`}
                >
                  {type}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
