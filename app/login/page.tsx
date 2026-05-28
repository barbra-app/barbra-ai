import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/organisms/LoginForm";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { getCurrentUser } from "@/services/auth";
import { getTranslator } from "@/i18n/server";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const current = await getCurrentUser();
  if (current) redirect("/dashboard");

  const { next } = await searchParams;
  const { t } = await getTranslator();

  return (
    <AuthLayout
      appName={t("app.name")}
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={
        <p className="text-slate-600">
          {t("auth.needAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
            {t("auth.createAccount")}
          </Link>
        </p>
      }
    >
      <LoginForm nextPath={next} />
    </AuthLayout>
  );
}
