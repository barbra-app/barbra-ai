import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/i18n/server";
import type { QrScanRow } from "@/types/domain";

export async function ScansTable({ scans }: { scans: QrScanRow[] }) {
  const { t, locale } = await getTranslator();

  if (scans.length === 0) {
    return <p className="text-sm text-slate-500">{t("qr.detail.noScans")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-4 font-medium">{t("qr.detail.scannedAt")}</th>
            <th className="py-2 pr-4 font-medium">{t("qr.detail.userAgent")}</th>
            <th className="py-2 pr-4 font-medium">{t("qr.detail.referrer")}</th>
            <th className="py-2 pr-4 font-medium">{t("qr.detail.country")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {scans.map((s) => (
            <tr key={s.id} className="text-slate-700">
              <td className="whitespace-nowrap py-2 pr-4">
                {formatDateTime(s.scanned_at, locale)}
              </td>
              <td className="max-w-xs truncate py-2 pr-4" title={s.user_agent ?? ""}>
                {s.user_agent ?? "—"}
              </td>
              <td className="max-w-xs truncate py-2 pr-4" title={s.referrer ?? ""}>
                {s.referrer ?? "—"}
              </td>
              <td className="py-2 pr-4">{s.country ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
