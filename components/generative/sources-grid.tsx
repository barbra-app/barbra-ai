import type { Source } from "@/lib/mcp/mock-data";

const SOURCE_COLOR: Record<string, string> = {
  meta: "#1877F2",
  google: "#EA4335",
  tiktok: "#25F4EE",
  linkedin: "#0A66C2",
  shopify: "#95BF47",
};

export function SourcesGrid({ sources }: { sources: Source[] }) {
  if (!sources?.length) {
    return (
      <div className="my-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-[12px] text-[var(--color-fg-muted)]">
        Aún no hay fuentes de datos conectadas. Conecta Meta, Google u otra plataforma desde el dashboard de Master Metrics.
      </div>
    );
  }
  return (
    <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {sources.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: SOURCE_COLOR[s.id] ?? "#888" }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
              {s.name}
            </div>
            <div className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
              {s.id}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
