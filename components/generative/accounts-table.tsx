import type { MMAccount } from "@/lib/mcp/mock-data";

const STATUS_TONE: Record<string, string> = {
  active: "text-[var(--color-brand-sage)]",
  paused: "text-[var(--color-brand-spark)]",
  disabled: "text-[var(--color-fg-subtle)]",
};

const STATUS_LABEL: Record<string, string> = {
  active: "activa",
  paused: "pausada",
  disabled: "desactivada",
};

export function AccountsTable({ accounts }: { accounts: MMAccount[] }) {
  if (!accounts?.length) {
    return (
      <div className="my-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-[12px] text-[var(--color-fg-muted)]">
        No hay cuentas conectadas para esta fuente.
      </div>
    );
  }
  return (
    <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            <th className="px-4 py-2 text-left font-medium">Cuenta</th>
            <th className="px-4 py-2 text-left font-medium">Fuente</th>
            <th className="px-4 py-2 text-left font-medium">ID</th>
            <th className="px-4 py-2 text-left font-medium">Moneda</th>
            <th className="px-4 py-2 text-left font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const status = a.status ?? "active";
            return (
              <tr
                key={a.id}
                className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-elev-2)]"
              >
                <td className="px-4 py-2.5 text-[var(--color-fg)]">{a.name}</td>
                <td className="px-4 py-2.5 capitalize text-[var(--color-fg-muted)]">{a.source}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                  {a.id}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">{a.currency ?? "—"}</td>
                <td className={`px-4 py-2.5 font-medium ${STATUS_TONE[status]}`}>
                  {STATUS_LABEL[status] ?? status}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
