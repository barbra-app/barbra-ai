import Link from "next/link";
import { notFound } from "next/navigation";

import { QrCodeDetail } from "@/components/organisms/QrCodeDetail";
import { PageHeader } from "@/components/templates/PageHeader";
import { getQrCodeById } from "@/services/qr-codes";
import {
  countScans,
  dailyScanSeries,
  listRecentScans,
} from "@/services/tracking";
import { getTranslator } from "@/i18n/server";

interface QrDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function QrDetailPage({ params }: QrDetailPageProps) {
  const { id } = await params;
  const qr = await getQrCodeById(id);
  if (!qr) notFound();

  const [totalScans, daily, recent, { t }] = await Promise.all([
    countScans(qr.id),
    dailyScanSeries(qr.id, 14),
    listRecentScans(qr.id, 25),
    getTranslator(),
  ]);

  return (
    <>
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
          ← {t("common.back")}
        </Link>
      </div>
      <PageHeader title={qr.name} subtitle={qr.destination_url} />
      <QrCodeDetail qr={qr} totalScans={totalScans} daily={daily} recent={recent} />
    </>
  );
}
