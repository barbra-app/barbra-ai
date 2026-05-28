"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { signUpAction } from "@/app/actions/auth";
import { useTranslations } from "@/i18n/provider";

export function RegisterForm() {
  const { t } = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    start(async () => {
      const result = await signUpAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(t("auth.registerSuccess"));
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormField id="fullName" label={t("auth.fullName")}>
        <Input id="fullName" name="fullName" type="text" autoComplete="name" required />
      </FormField>
      <FormField id="email" label={t("auth.email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField id="password" label={t("auth.password")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </FormField>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("auth.creatingAccount") : t("auth.createAccount")}
      </Button>
    </form>
  );
}
