"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { createQrCodeAction } from "@/app/actions/qr-codes";
import { useTranslations } from "@/i18n/provider";

export function QrCodeForm() {
  const { t } = useTranslations();
  const router = useRouter();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mapErrorCode(code: string): string {
    switch (code) {
      case "invalid_url":
        return t("qr.errors.invalidUrl");
      case "invalid_slug":
        return t("qr.errors.invalidSlug");
      case "slug_taken":
        return t("qr.errors.slugTaken");
      default:
        return t("qr.errors.generic");
    }
  }

  async function handleSubmit(formData: FormData) {
    setErrorKey(null);
    start(async () => {
      const result = await createQrCodeAction(formData);
      if (result.ok) {
        router.push(`/dashboard/qr/${result.id}`);
        router.refresh();
      } else {
        setErrorKey(result.code);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <FormField id="name" label={t("qr.name")}>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder={t("qr.namePlaceholder")}
          maxLength={120}
        />
      </FormField>

      <FormField id="destinationUrl" label={t("qr.destinationUrl")}>
        <Input
          id="destinationUrl"
          name="destinationUrl"
          type="url"
          required
          placeholder={t("qr.destinationPlaceholder")}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField id="utm_source" label={t("qr.utmSource")}>
          <Input id="utm_source" name="utm_source" type="text" />
        </FormField>
        <FormField id="utm_medium" label={t("qr.utmMedium")}>
          <Input id="utm_medium" name="utm_medium" type="text" />
        </FormField>
        <FormField id="utm_campaign" label={t("qr.utmCampaign")}>
          <Input id="utm_campaign" name="utm_campaign" type="text" />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id="utm_term" label={t("qr.utmTerm")}>
          <Input id="utm_term" name="utm_term" type="text" />
        </FormField>
        <FormField id="utm_content" label={t("qr.utmContent")}>
          <Input id="utm_content" name="utm_content" type="text" />
        </FormField>
      </div>

      <FormField id="customSlug" label={t("qr.customSlug")} hint={t("qr.customSlugHint")}>
        <Input id="customSlug" name="customSlug" type="text" maxLength={32} />
      </FormField>

      {errorKey ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {mapErrorCode(errorKey)}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("qr.creating") : t("qr.create")}
        </Button>
      </div>
    </form>
  );
}
