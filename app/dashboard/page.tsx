import Link from "next/link";

import { Button } from "@/components/atoms/Button";
import { QrCodeList } from "@/components/organisms/QrCodeList";
import { PageHeader } from "@/components/templates/PageHeader";
import { listQrCodes } from "@/services/qr-codes";
import { getTranslator } from "@/i18n/server";

export default async function DashboardPage() {
  const { t } = await getTranslator();
  const items = await listQrCodes();

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          <Link href="/dashboard/qr/new">
            <Button>{t("dashboard.newQr")}</Button>
          </Link>
        }
      />
      <QrCodeList items={items} />
    </>
  );
}
