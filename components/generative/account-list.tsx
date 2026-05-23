import type { Account } from "@/lib/mcp/mock-data";

export function AccountList({ accounts }: { accounts: Account[] }) {
  return (
    <div className="my-3 grid grid-cols-2 gap-2">
      {accounts.map((a) => (
        <div
          key={a.id}
          className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
        >
          <div className="text-[13px] font-medium text-[var(--color-fg)]">
            {a.name}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
            {a.industry}
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-fg-muted)]">
            <span className="tabular-nums text-[var(--color-brand-spark)]">
              {a.activeCampaigns}
            </span>{" "}
            active campaign{a.activeCampaigns === 1 ? "" : "s"}
          </div>
        </div>
      ))}
    </div>
  );
}
