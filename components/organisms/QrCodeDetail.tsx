import Image from "next/image";

import { Card, CardBody, CardHeader } from "@/components/atoms/Card";
import { CopyableUrl } from "@/components/molecules/CopyableUrl";
import { StatCard } from "@/components/molecules/StatCard";
import { QrCodeActions } from "@/components/organisms/QrCodeActions";
import { ScansChart } from "@/components/organisms/ScansChart";
import { ScansTable } from "@/components/organisms/ScansTable";
import { formatDateTime } from "@/lib/format";
import { buildTrackingUrl } from "@/lib/qr";
import { getTranslator } from "@/i18n/server";
import type { DailyScanPoint, QrCodeRow, QrScanRow } from "@/types/domain";

interface QrCodeDetailProps {
  qr: QrCodeRow;
  totalScans: number;
  daily: DailyScanPoint[];
  recent: QrScanRow[];
}

export async function QrCodeDetail({ qr, totalScans, daily, recent }: QrCodeDetailProps) {
  const { t, locale } = await getTranslator();
  const trackingUrl = buildTrackingUrl(qr.slug);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardBody className="flex flex-col items-center gap-4">
            {qr.image_url ? (
              <Image
                src={qr.image_url}
                alt={qr.name}
                width={256}
                height={256}
                className="h-64 w-64 rounded-md border border-slate-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
                —
              </div>
            )}
            <QrCodeActions qrId={qr.id} name={qr.name} imageUrl={qr.image_url} />
            <p className="text-xs text-slate-500">
              {t("common.createdAt")} {formatDateTime(qr.created_at, locale)}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label={t("qr.detail.totalScans")} value={totalScans} />
          <StatCard
            label={t("qr.detail.last14")}
            value={daily.reduce((acc, p) => acc + p.count, 0)}
          />
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-medium text-slate-900">{t("qr.detail.last14")}</h3>
          </CardHeader>
          <CardBody>
            <ScansChart data={daily} />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                {t("qr.detail.trackingUrl")}
              </p>
              <CopyableUrl value={trackingUrl} />
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                {t("qr.detail.finalUrl")}
              </p>
              <CopyableUrl value={qr.final_url} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-medium text-slate-900">{t("qr.detail.recentScans")}</h3>
          </CardHeader>
          <CardBody>
            <ScansTable scans={recent} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
