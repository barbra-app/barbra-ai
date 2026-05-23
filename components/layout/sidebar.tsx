"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  MOCK_ACCOUNTS,
  MOCK_CAMPAIGNS,
  type Account,
  type Campaign,
} from "@/lib/mcp/mock-data";
import { cn } from "@/lib/utils";

export interface SidebarSelection {
  account: Account | null;
  campaignIds: string[];
}

const CHANNEL_COLORS: Record<Campaign["channel"], string> = {
  meta: "#1877F2",
  google: "#EA4335",
  tiktok: "#25F4EE",
  linkedin: "#0A66C2",
};

export function Sidebar({
  selection,
  onSelectionChange,
}: {
  selection: SidebarSelection;
  onSelectionChange: (s: SidebarSelection) => void;
}) {
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [campaignsOpen, setCampaignsOpen] = useState(true);

  const campaignsForAccount = selection.account
    ? MOCK_CAMPAIGNS.filter((c) => c.accountId === selection.account!.id)
    : [];

  function pickAccount(account: Account) {
    onSelectionChange({ account, campaignIds: [] });
  }

  function toggleCampaign(id: string) {
    const next = selection.campaignIds.includes(id)
      ? selection.campaignIds.filter((c) => c !== id)
      : [...selection.campaignIds, id];
    onSelectionChange({ ...selection, campaignIds: next });
  }

  return (
    <aside className="barbra-grain flex h-screen w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex h-14 items-center border-b border-[var(--color-border)] px-5">
        <BrandMark />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <Section
          title="Accounts"
          open={accountsOpen}
          onToggle={() => setAccountsOpen((v) => !v)}
        >
          {MOCK_ACCOUNTS.map((a) => {
            const active = selection.account?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => pickAccount(a)}
                className={cn(
                  "group flex w-full items-start justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left transition",
                  active
                    ? "bg-[var(--color-bg-elev-2)]"
                    : "hover:bg-[var(--color-bg-elev)]"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
                    {a.name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-fg-subtle)]">
                    {a.industry} · {a.activeCampaigns} active
                  </div>
                </div>
                {active && (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand-spark)]" />
                )}
              </button>
            );
          })}
        </Section>

        {selection.account && (
          <Section
            title={`Campaigns — ${selection.account.name}`}
            open={campaignsOpen}
            onToggle={() => setCampaignsOpen((v) => !v)}
          >
            {campaignsForAccount.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-[var(--color-fg-subtle)]">
                No campaigns for this account.
              </p>
            )}
            {campaignsForAccount.map((c) => {
              const selected = selection.campaignIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCampaign(c.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition",
                    selected
                      ? "bg-[var(--color-bg-elev-2)]"
                      : "hover:bg-[var(--color-bg-elev)]"
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[c.channel] }}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "flex-1 truncate text-[12.5px]",
                      selected
                        ? "text-[var(--color-fg)]"
                        : "text-[var(--color-fg-muted)]"
                    )}
                  >
                    {c.name}
                  </span>
                  {c.status !== "active" && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      {c.status}
                    </span>
                  )}
                  {selected && (
                    <Check className="size-3 text-[var(--color-brand-spark)]" />
                  )}
                </button>
              );
            })}
          </Section>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] px-5 py-3 text-[11px] text-[var(--color-fg-subtle)]">
        <div className="flex items-center justify-between">
          <span>Mock MCP · dev</span>
          <span className="rounded-full bg-[var(--color-brand-cta)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-brand-cta)]">
            Opus 4.7
          </span>
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="mb-1 flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      {open && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
