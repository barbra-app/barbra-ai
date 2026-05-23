"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  MOCK_ACCOUNTS,
  MOCK_SOURCES,
  type MMAccount,
  type Source,
  type SourceId,
} from "@/lib/mcp/mock-data";
import { cn } from "@/lib/utils";

export interface SidebarSelection {
  source: Source | null;
  accountIds: string[];
}

const SOURCE_COLOR: Record<SourceId, string> = {
  meta: "#1877F2",
  google: "#EA4335",
  tiktok: "#25F4EE",
  linkedin: "#0A66C2",
  shopify: "#95BF47",
};

export function Sidebar({
  selection,
  onSelectionChange,
}: {
  selection: SidebarSelection;
  onSelectionChange: (s: SidebarSelection) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [accountsOpen, setAccountsOpen] = useState(true);

  const accountsForSource: MMAccount[] = selection.source
    ? MOCK_ACCOUNTS.filter((a) => a.source === selection.source!.id)
    : [];

  function pickSource(source: Source) {
    onSelectionChange({ source, accountIds: [] });
  }

  function toggleAccount(id: string) {
    const next = selection.accountIds.includes(id)
      ? selection.accountIds.filter((a) => a !== id)
      : [...selection.accountIds, id];
    onSelectionChange({ ...selection, accountIds: next });
  }

  return (
    <aside className="barbra-grain flex h-screen w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex h-14 items-center border-b border-[var(--color-border)] px-5">
        <BrandMark />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <Section
          title="Data Sources"
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((v) => !v)}
        >
          {MOCK_SOURCES.map((s) => {
            const active = selection.source?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => pickSource(s)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition",
                  active
                    ? "bg-[var(--color-bg-elev-2)]"
                    : "hover:bg-[var(--color-bg-elev)]"
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: SOURCE_COLOR[s.id] }}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex-1 truncate text-[13px]",
                    active
                      ? "font-medium text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)]"
                  )}
                >
                  {s.displayName}
                </span>
                {active && (
                  <Check className="size-3.5 text-[var(--color-brand-spark)]" />
                )}
              </button>
            );
          })}
        </Section>

        {selection.source && (
          <Section
            title={`Accounts — ${selection.source.displayName}`}
            open={accountsOpen}
            onToggle={() => setAccountsOpen((v) => !v)}
          >
            {accountsForSource.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-[var(--color-fg-subtle)]">
                No accounts connected for this source.
              </p>
            )}
            {accountsForSource.map((a) => {
              const selected = selection.accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left transition",
                    selected
                      ? "bg-[var(--color-bg-elev-2)]"
                      : "hover:bg-[var(--color-bg-elev)]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
                      selected
                        ? "border-[var(--color-brand-spark)] bg-[var(--color-brand-spark)]/15"
                        : "border-[var(--color-border-strong)]"
                    )}
                  >
                    {selected && (
                      <Check className="size-2.5 text-[var(--color-brand-spark)]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-[12.5px]",
                        selected
                          ? "text-[var(--color-fg)]"
                          : "text-[var(--color-fg-muted)]"
                      )}
                    >
                      {a.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-[var(--color-fg-subtle)]">
                      {a.id}
                      {a.currency ? ` · ${a.currency}` : ""}
                      {a.status && a.status !== "active" ? ` · ${a.status}` : ""}
                    </div>
                  </div>
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
