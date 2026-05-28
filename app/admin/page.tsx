import { QrCodeList } from "@/components/organisms/QrCodeList";
import { StatCard } from "@/components/molecules/StatCard";
import { PageHeader } from "@/components/templates/PageHeader";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listQrCodes } from "@/services/qr-codes";
import { getTranslator } from "@/i18n/server";

/**
 * Admin sees every QR code (RLS opens up via is_admin()) and a few global counters.
 */
export default async function AdminPage() {
  const { t } = await getTranslator();
  const supabase = await createServerSupabaseClient();

  const [{ count: userCount }, items, { count: scanCount }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    listQrCodes(),
    supabase.from("qr_scans").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("admin.totalUsers")} value={userCount ?? 0} />
        <StatCard label={t("admin.totalQrCodes")} value={items.length} />
        <StatCard label={t("admin.totalScans")} value={scanCount ?? 0} />
      </div>

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
        {t("admin.recentQrs")}
      </h2>
      <QrCodeList items={items} showOwner />
    </>
  );
}
