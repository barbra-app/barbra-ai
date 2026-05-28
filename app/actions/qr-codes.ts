"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/services/auth";
import {
  QrCodeServiceError,
  createQrCode,
  deleteQrCode,
  renameQrCode,
} from "@/services/qr-codes";

type CreateResult = { ok: true; id: string } | { ok: false; code: string };

export async function createQrCodeAction(formData: FormData): Promise<CreateResult> {
  const current = await requireUser();
  try {
    const qr = await createQrCode(current.userId, {
      name: String(formData.get("name") ?? "").trim(),
      destinationUrl: String(formData.get("destinationUrl") ?? "").trim(),
      utm: {
        source: stringOrUndefined(formData.get("utm_source")),
        medium: stringOrUndefined(formData.get("utm_medium")),
        campaign: stringOrUndefined(formData.get("utm_campaign")),
        term: stringOrUndefined(formData.get("utm_term")),
        content: stringOrUndefined(formData.get("utm_content")),
      },
      customSlug: stringOrUndefined(formData.get("customSlug")),
    });
    revalidatePath("/dashboard");
    return { ok: true, id: qr.id };
  } catch (err) {
    if (err instanceof QrCodeServiceError) return { ok: false, code: err.code };
    return { ok: false, code: "unknown" };
  }
}

export async function renameQrCodeAction(id: string, name: string): Promise<void> {
  await requireUser();
  await renameQrCode(id, name);
  revalidatePath(`/dashboard/qr/${id}`);
  revalidatePath("/dashboard");
}

export async function deleteQrCodeAction(id: string): Promise<void> {
  await requireUser();
  await deleteQrCode(id);
  revalidatePath("/dashboard");
}

function stringOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s.length === 0 ? undefined : s;
}
