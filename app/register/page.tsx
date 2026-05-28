import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/organisms/RegisterForm";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { getCurrentUser } from "@/services/auth";
import { getTranslator } from "@/i18n/server";

export default async function RegisterPage() {
  const current = await getCurrentUser();
  if (current) redirect("/dashboard");

  const { t } = await getTranslator();

  return (
    <AuthLayout
      appName={t("app.name")}
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <p className="text-slate-600">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            {t("auth.signIn")}
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
