"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/atoms/Button";
import { deleteQrCodeAction, renameQrCodeAction } from "@/app/actions/qr-codes";
import { useTranslations } from "@/i18n/provider";

interface QrCodeActionsProps {
  qrId: string;
  name: string;
  imageUrl: string | null;
}

export function QrCodeActions({ qrId, name, imageUrl }: QrCodeActionsProps) {
  const { t } = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();

  function onRename() {
    const next = window.prompt(t("qr.detail.renamePrompt"), name);
    if (!next || next.trim() === name) return;
    start(async () => {
      await renameQrCodeAction(qrId, next.trim());
      router.refresh();
    });
  }

  function onDelete() {
    if (!window.confirm(t("qr.detail.deleteConfirm"))) return;
    start(async () => {
      await deleteQrCodeAction(qrId);
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {imageUrl ? (
        <a href={imageUrl} download={`${name}.png`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="secondary">
            {t("common.download")}
          </Button>
        </a>
      ) : null}
      <Button size="sm" variant="secondary" onClick={onRename} disabled={pending}>
        {t("common.rename")}
      </Button>
      <Button size="sm" variant="danger" onClick={onDelete} disabled={pending}>
        {t("common.delete")}
      </Button>
    </div>
  );
}
