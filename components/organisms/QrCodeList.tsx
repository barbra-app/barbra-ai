import Link from "next/link";

import { Badge } from "@/components/atoms/Badge";
import { Card, CardBody } from "@/components/atoms/Card";
import { EmptyState } from "@/components/molecules/EmptyState";
import { Button } from "@/components/atoms/Button";
import { formatDate } from "@/lib/format";
import { getTranslator } from "@/i18n/server";
import type { QrCodeWithStats } from "@/types/domain";

interface QrCodeListProps {
  items: QrCodeWithStats[];
  showOwner?: boolean;
}

export async function QrCodeList({ items, showOwner = false }: QrCodeListProps) {
  const { t, locale } = await getTranslator();

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("dashboard.empty")}
        action={
          <Link href="/dashboard/qr/new">
            <Button size="sm">{t("dashboard.emptyCta")}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((qr) => (
        <li key={qr.id}>
          <Card className="h-full">
            <CardBody className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-slate-900">
                    {qr.name}
                  </p>
                  <p className="truncate text-xs text-slate-500" title={qr.destination_url}>
                    {qr.destination_url}
                  </p>
                </div>
                <Badge tone="brand">
                  {qr.scan_count} {t("dashboard.scans")}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {t("common.createdAt")} {formatDate(qr.created_at, locale)}
                </span>
                {showOwner ? (
                  <span className="font-mono text-[10px]">{qr.owner_id.slice(0, 8)}…</span>
                ) : null}
              </div>
              <div className="mt-auto">
                <Link href={`/dashboard/qr/${qr.id}`}>
                  <Button variant="secondary" size="sm">
                    {t("dashboard.view")}
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
