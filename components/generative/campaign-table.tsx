import type { Campaign } from "@/lib/mcp/mock-data";

const CHANNEL_LABEL: Record<Campaign["channel"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

const STATUS_TONE: Record<Campaign["status"], string> = {
  active: "text-[var(--color-brand-sage)]",
  paused: "text-[var(--color-brand-spark)]",
  ended: "text-[var(--color-fg-subtle)]",
};

export function CampaignTable({
  data,
}: {
  data: { accountName: string; campaigns: Campaign[] };
}) {
  return (
    <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <header className="flex items-baseline justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h3
          className="text-[13px] font-medium text-[var(--color-fg)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {data.accountName}
        </h3>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">
          {data.campaigns.length} campaign{data.campaigns.length === 1 ? "" : "s"}
        </span>
      </header>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            <th className="px-4 py-2 text-left font-medium">Campaign</th>
            <th className="px-4 py-2 text-left font-medium">Channel</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Start</th>
          </tr>
        </thead>
        <tbody>
          {data.campaigns.map((c) => (
            <tr
              key={c.id}
              className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-elev-2)]"
            >
              <td className="px-4 py-2.5 text-[var(--color-fg)]">{c.name}</td>
              <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">
                {CHANNEL_LABEL[c.channel]}
              </td>
              <td className={`px-4 py-2.5 font-medium ${STATUS_TONE[c.status]}`}>
                {c.status}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-[var(--color-fg-muted)]">
                {c.startDate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
