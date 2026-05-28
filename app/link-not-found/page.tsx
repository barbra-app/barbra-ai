import Link from "next/link";

import { getTranslator } from "@/i18n/server";

/**
 * Public 404 landing for the /r/[slug] tracking redirect when a slug isn't found.
 * Lives outside /r/ to avoid colliding with the dynamic [slug] route handler.
 */
export default async function LinkNotFoundPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("redirect.notFoundTitle")}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t("redirect.notFoundBody")}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {t("app.name")}
        </Link>
      </div>
    </div>
  );
}
