"use client";

import { useState } from "react";

import { Button } from "@/components/atoms/Button";
import { useTranslations } from "@/i18n/provider";

export function CopyableUrl({ value }: { value: string }) {
  const { t } = useTranslations();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked; nothing safe to do.
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={value}
        className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button type="button" variant="secondary" onClick={copy}>
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
    </div>
  );
}
