"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useTranslations } from "@/i18n/provider";
import { LOCALES, type Locale } from "@/i18n/config";

const LABEL: Record<Locale, string> = { en: "EN", es: "ES" };

export function LanguageSwitcher() {
  const { locale, t } = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();

  function setLocale(next: Locale) {
    if (next === locale) return;
    // Cookie is read by server components on the next render to pick the dictionary.
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    start(() => router.refresh());
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5"
      aria-label={t("nav.language")}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          disabled={pending}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            l === locale
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
