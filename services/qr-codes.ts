import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTrackingUrl, renderQrPngBuffer } from "@/lib/qr";
import { generateSlug, normalizeSlug } from "@/lib/slug";
import { buildFinalUrl, isValidHttpUrl } from "@/lib/utm";
import type {
  CreateQrCodeInput,
  QrCodeRow,
  QrCodeWithStats,
} from "@/types/domain";

import { deleteImage, uploadImageBuffer } from "./cloudinary";

const SLUG_RETRIES = 5;

export class QrCodeServiceError extends Error {
  code:
    | "invalid_url"
    | "invalid_slug"
    | "slug_taken"
    | "not_found"
    | "forbidden"
    | "unknown";
  constructor(code: QrCodeServiceError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Creates a QR code end-to-end:
 *   1. validates inputs + reserves a unique slug
 *   2. builds the UTM-tagged final URL and the short tracking URL
 *   3. renders the QR PNG (encoding the tracking URL, so every scan flows through /r/[slug])
 *   4. uploads the PNG to Cloudinary
 *   5. inserts the qr_codes row under the current user's session (RLS enforces ownership)
 */
export async function createQrCode(
  ownerId: string,
  input: CreateQrCodeInput,
): Promise<QrCodeRow> {
  if (!isValidHttpUrl(input.destinationUrl)) {
    throw new QrCodeServiceError("invalid_url", "Destination URL must be a valid http(s) URL.");
  }

  const supabase = await createServerSupabaseClient();
  const slug = await reserveSlug(supabase, input.customSlug);

  const finalUrl = buildFinalUrl(input.destinationUrl, input.utm);
  const trackingUrl = buildTrackingUrl(slug);

  const pngBuffer = await renderQrPngBuffer(trackingUrl);
  const upload = await uploadImageBuffer(pngBuffer, slug);

  const { data, error } = await supabase
    .from("qr_codes")
    .insert({
      owner_id: ownerId,
      name: input.name.trim(),
      destination_url: input.destinationUrl,
      utm_source: input.utm.source?.trim() || null,
      utm_medium: input.utm.medium?.trim() || null,
      utm_campaign: input.utm.campaign?.trim() || null,
      utm_term: input.utm.term?.trim() || null,
      utm_content: input.utm.content?.trim() || null,
      slug,
      final_url: finalUrl,
      image_url: upload.url,
      image_public_id: upload.publicId,
    })
    .select("*")
    .single<QrCodeRow>();

  if (error || !data) {
    // Roll back the Cloudinary upload if the DB write failed.
    await deleteImage(upload.publicId);
    throw new QrCodeServiceError("unknown", error?.message ?? "Failed to save QR code.");
  }
  return data;
}

/**
 * Lists the caller's QR codes. Admin callers see all codes thanks to RLS.
 * Includes a `scan_count` per row via a single grouped query.
 */
export async function listQrCodes(): Promise<QrCodeWithStats[]> {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("qr_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new QrCodeServiceError("unknown", error.message);
  const codes = (rows ?? []) as QrCodeRow[];
  if (codes.length === 0) return [];

  const ids = codes.map((c) => c.id);
  const { data: scanRows } = await supabase
    .from("qr_scans")
    .select("qr_code_id")
    .in("qr_code_id", ids);

  const counts = new Map<string, number>();
  for (const row of (scanRows ?? []) as Array<{ qr_code_id: string }>) {
    counts.set(row.qr_code_id, (counts.get(row.qr_code_id) ?? 0) + 1);
  }

  return codes.map((c) => ({ ...c, scan_count: counts.get(c.id) ?? 0 }));
}

/**
 * Fetches a single QR code by ID. Returns null if it does not exist OR the caller
 * is not allowed to see it (RLS).
 */
export async function getQrCodeById(id: string): Promise<QrCodeRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("id", id)
    .maybeSingle<QrCodeRow>();
  if (error) throw new QrCodeServiceError("unknown", error.message);
  return data ?? null;
}

/**
 * Renames a QR code. RLS ensures only the owner (or admin) can update.
 */
export async function renameQrCode(id: string, name: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("qr_codes").update({ name: name.trim() }).eq("id", id);
  if (error) throw new QrCodeServiceError("unknown", error.message);
}

/**
 * Deletes a QR code and its Cloudinary asset. RLS gates the DB delete; the
 * Cloudinary cleanup is best-effort.
 */
export async function deleteQrCode(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("qr_codes")
    .select("image_public_id")
    .eq("id", id)
    .maybeSingle<{ image_public_id: string | null }>();

  const { error } = await supabase.from("qr_codes").delete().eq("id", id);
  if (error) throw new QrCodeServiceError("unknown", error.message);

  if (existing?.image_public_id) {
    await deleteImage(existing.image_public_id);
  }
}

/**
 * Reserves a unique slug. If `requested` is supplied, normalizes and uses it;
 * otherwise generates randomly and retries on the unlikely collision.
 *
 * Uses a uniqueness-check round-trip rather than catching a unique-violation
 * because we only have the user's anon client here (no service role) and the
 * existence check still benefits from the `slug` unique index.
 */
async function reserveSlug(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  requested: string | undefined,
): Promise<string> {
  if (requested && requested.trim()) {
    const normalized = normalizeSlug(requested);
    if (!normalized) {
      throw new QrCodeServiceError(
        "invalid_slug",
        "Slug must be 2-32 chars, lowercase letters/numbers/dashes.",
      );
    }
    const taken = await isSlugTaken(supabase, normalized);
    if (taken) throw new QrCodeServiceError("slug_taken", "That slug is already in use.");
    return normalized;
  }

  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    const candidate = generateSlug();
    const taken = await isSlugTaken(supabase, candidate);
    if (!taken) return candidate;
  }
  throw new QrCodeServiceError("unknown", "Could not allocate a unique slug.");
}

async function isSlugTaken(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  slug: string,
): Promise<boolean> {
  const { data } = await supabase.from("qr_codes").select("id").eq("slug", slug).maybeSingle();
  return Boolean(data);
}
