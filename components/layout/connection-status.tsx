"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";

type Status = "loading" | "connected" | "disconnected";

/**
 * Pastilla de estado MCP en el footer del sidebar.
 *  - loading: spinner discreto
 *  - disconnected: punto rojo + botón "Conectar Master Metrics" (redirige
 *    al flujo OAuth)
 *  - connected: punto verde + "MCP en vivo" + botón desconectar
 *
 * El callback OAuth añade ?mm_connected=1 / ?mm_error=… a la URL al
 * volver; lo limpiamos y refrescamos el estado.
 *
 * `onConnectionChange` se dispara cuando el estado de auth cambia
 * (conectar exitoso, desconectar) para que el padre pueda refrescar
 * data del MCP (ej. lista de sources/accounts en el sidebar).
 */
export function ConnectionStatus({
  onConnectionChange,
}: {
  onConnectionChange?: () => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/mcp/status", { cache: "no-store" });
      const d = await r.json();
      setStatus(d.connected ? "connected" : "disconnected");
    } catch {
      setStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    // On mount: read URL flags from the OAuth callback redirect, then
    // strip them and refresh.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("mm_connected");
    const err = params.get("mm_error");
    if (connected || err) {
      params.delete("mm_connected");
      params.delete("mm_error");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "");
      window.history.replaceState({}, "", url);
      if (err) setError(decodeURIComponent(err));
      if (connected) onConnectionChange?.();
    }
    refresh();
    // onConnectionChange intentionally omitted from deps — we only want
    // to fire it on the post-callback boot, not every time the parent
    // re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  async function disconnect() {
    await fetch("/api/auth/mcp/disconnect", { method: "POST" });
    setStatus("disconnected");
    onConnectionChange?.();
  }

  function connect() {
    window.location.href = "/api/auth/mcp/start";
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-[8px] border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-[10.5px] text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 underline-offset-2 hover:underline"
          >
            cerrar
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg-subtle)]">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-fg-subtle)]" />
          <span>Comprobando MCP…</span>
        </div>
      )}

      {status === "disconnected" && (
        <button
          onClick={connect}
          className="flex w-full items-center justify-between rounded-[10px] border border-[var(--color-brand-cta)]/40 bg-[var(--color-brand-cta)]/8 px-3 py-2 text-left transition hover:bg-[var(--color-brand-cta)]/15"
        >
          <div>
            <div className="text-[12px] font-medium text-[var(--color-brand-cta)]">
              Conectar Master Metrics
            </div>
            <div className="text-[10px] text-[var(--color-fg-subtle)]">
              Usando datos de prueba
            </div>
          </div>
          <span className="size-2 rounded-full bg-red-400" aria-hidden />
        </button>
      )}

      {status === "connected" && (
        <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-brand-sage)]/30 bg-[var(--color-brand-sage)]/8 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--color-brand-sage)]" aria-hidden />
            <div>
              <div className="text-[12px] font-medium text-[var(--color-brand-sage)]">
                MCP en vivo
              </div>
              <div className="text-[10px] text-[var(--color-fg-subtle)]">
                Master Metrics conectado
              </div>
            </div>
          </div>
          <button
            onClick={disconnect}
            className="grid size-6 place-items-center rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg-muted)]"
            aria-label="Desconectar"
            title="Desconectar"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
