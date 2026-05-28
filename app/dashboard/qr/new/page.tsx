import Link from "next/link";

import { Card, CardBody } from "@/components/atoms/Card";
import { QrCodeForm } from "@/components/organisms/QrCodeForm";
import { PageHeader } from "@/components/templates/PageHeader";
import { getTranslator } from "@/i18n/server";

export default async function NewQrCodePage() {
  const { t } = await getTranslator();
  return (
    <>
      <PageHeader title={t("qr.newTitle")} subtitle={t("qr.newSubtitle")} />
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
          ← {t("common.back")}
        </Link>
      </div>
      <Card>
        <CardBody>
          <QrCodeForm />
        </CardBody>
      </Card>
    </>
  );
}
