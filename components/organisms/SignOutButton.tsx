"use client";

import { useTransition } from "react";

import { Button } from "@/components/atoms/Button";
import { signOutAction } from "@/app/actions/auth";
import { useTranslations } from "@/i18n/provider";

export function SignOutButton() {
  const { t } = useTranslations();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOutAction();
          window.location.assign("/login");
        })
      }
    >
      {t("nav.signOut")}
    </Button>
  );
}
