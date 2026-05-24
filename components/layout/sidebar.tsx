"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { ConnectionStatus } from "@/components/layout/connection-status";
import {
  type MMAccount,
  type Source,
  type SourceId,
} from "@/lib/mcp/mock-data";
import { cn } from "@/lib/utils";

export interface SidebarSelection {
  source: Source | null;
  accountIds: string[];
}

const SOURCE_COLOR: Record<string, string> = {
  meta: "#1877F2",
  google: "#EA4335",
  tiktok: "#25F4EE",
  linkedin: "#0A66C2",
  shopify: "#95BF47",
};

/**
 * En md+ el sidebar es una barra lateral persistente (w-72).
 * En móvil es un drawer que entra desde la izquierda, controlado por
 * `open` desde el parent; tap fuera o en la X cierra.
 *
 * Las fuentes y cuentas se cargan desde /api/mcp/sources y
 * /api/mcp/accounts. Esos endpoints devuelven la data real del MCP si
 * hay sesión OAuth activa, o los mocks si no. Cuando ConnectionStatus
 * detecta un cambio (conectar/desconectar), bumpea connectionKey y el
 * sidebar refresca todo y limpia la selección anterior — los IDs de
 * mocks no existen en MM real, así que reusarlos rompería las queries.
 */
export function Sidebar({
  selection,
  onSelectionChange,
  open,
  onClose,
}: {
  selection: SidebarSelection;
  onSelectionChange: (s: SidebarSelection) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);
  const [accounts, setAccounts] = useState<MMAccount[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [connectionKey, setConnectionKey] = useState(0);

  // Fetch sources on mount + when connection changes
  useEffect(() => {
    let cancelled = false;
    setLoadingSources(true);
    setSourcesError(null);
    fetch("/api/mcp/sources", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSources(Array.isArray(d.sources) ? d.sources : []);
        if (d.error) setSourcesError(d.error);
      })
      .catch((e) => {
        if (!cancelled) setSourcesError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionKey]);

  // Fetch accounts when source selected or connection changes
  useEffect(() => {
    if (!selection.source) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    setLoadingAccounts(true);
    fetch(`/api/mcp/accounts?source=${encodeURIComponent(selection.source.id)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection.source, connectionKey]);

  function handleConnectionChange() {
    // Limpia la selección — los IDs de la sesión anterior (real o mock)
    // ya no son válidos en la nueva.
    onSelectionChange({ source: null, accountIds: [] });
    setConnectionKey((k) => k + 1);
  }

  function pickSource(source: Source) {
    onSelectionChange({ source, accountIds: [] });
    closeIfMobile();
  }

  function toggleAccount(id: string) {
    const next = selection.accountIds.includes(id)
      ? selection.accountIds.filter((a) => a !== id)
      : [...selection.accountIds, id];
    onSelectionChange({ ...selection, accountIds: next });
  }

  function closeIfMobile() {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onClose();
    }
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          "barbra-grain fixed inset-y-0 left-0 z-40 flex h-dvh w-[85vw] max-w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)] transition-transform duration-200 ease-out",
          "md:relative md:z-auto md:w-72 md:translate-x-0 md:transition-none",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-5">
          <BrandMark />
          <button
            onClick={onClose}
            className="-mr-1.5 grid size-8 place-items-center rounded-md text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-bg-elev)] hover:text-[var(--color-fg-muted)] md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Section
            title="Fuentes de datos"
            open={sourcesOpen}
            onToggle={() => setSourcesOpen((v) => !v)}
            loading={loadingSources}
          >
            {sourcesError && (
              <p className="px-3 py-2 text-[11px] text-red-400">
                {sourcesError}
              </p>
            )}
            {!loadingSources && sources.length === 0 && !sourcesError && (
              <p className="px-3 py-2 text-[12px] text-[var(--color-fg-subtle)]">
                No hay fuentes conectadas en tu organización.
              </p>
            )}
            {sources.map((s) => {
              const active = selection.source?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => pickSource(s)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition",
                    active
                      ? "bg-[var(--color-bg-elev-2)]"
                      : "hover:bg-[var(--color-bg-elev)]"
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: SOURCE_COLOR[s.id] ?? "#888" }}
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
                    {s.name}
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
              title={`Cuentas — ${selection.source.name}`}
              open={accountsOpen}
              onToggle={() => setAccountsOpen((v) => !v)}
              loading={loadingAccounts}
            >
              {!loadingAccounts && accounts.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-[var(--color-fg-subtle)]">
                  No hay cuentas conectadas para esta fuente.
                </p>
              )}
              {accounts.map((a) => {
                const selected = selection.accountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={cn(
                      "group flex w-full items-start gap-2 rounded-[10px] px-3 py-2.5 text-left transition",
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

        <div className="space-y-2 border-t border-[var(--color-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ConnectionStatus onConnectionChange={handleConnectionChange} />
          <div className="flex items-center justify-between px-1 text-[10px] text-[var(--color-fg-subtle)]">
            <span>Barbra · v0.1</span>
            <span className="rounded-full bg-[var(--color-brand-cta)]/15 px-2 py-0.5 font-medium uppercase tracking-wider text-[var(--color-brand-cta)]">
              Sonnet 4.6
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  open,
  onToggle,
  loading,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="mb-1 flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
      >
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {loading && (
            <span className="size-1 animate-pulse rounded-full bg-[var(--color-brand-spark)]" />
          )}
        </div>
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
