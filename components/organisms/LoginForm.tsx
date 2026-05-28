"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { signInAction } from "@/app/actions/auth";
import { useTranslations } from "@/i18n/provider";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const { t } = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await signInAction(formData, nextPath);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Hard navigation: guarantees the freshly-installed auth cookies are sent
      // on the next request and bypasses the App Router cache for the
      // destination. router.push/refresh race here — push doesn't commit
      // synchronously, so refresh fires against /login and the navigation can
      // end up not happening.
      window.location.assign(result.redirectTo);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormField id="email" label={t("auth.email")}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </FormField>
      <FormField id="password" label={t("auth.password")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
        />
      </FormField>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
