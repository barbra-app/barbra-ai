import "server-only";

import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { isoDay } from "@/lib/format";
import type { DailyScanPoint, QrCodeRow, QrScanRow } from "@/types/domain";

export interface RedirectTarget {
  qrId: string;
  finalUrl: string;
}

/**
 * Looks up a QR by slug and returns the redirect target, or null if not found.
 * Uses the service-role client because the redirect endpoint is public (no session).
 *
 * If the service-role key isn't configured we log and return null so the route
 * degrades to a friendly 404 instead of a 500.
 */
export async function resolveSlugToTarget(slug: string): Promise<RedirectTarget | null> {
  let supabase;
  try {
    supabase = createServiceRoleSupabaseClient();
  } catch (err) {
    console.error("[tracking] service-role client unavailable:", err);
    return null;
  }
  const { data } = await supabase
    .from("qr_codes")
    .select("id, final_url")
    .eq("slug", slug)
    .maybeSingle<Pick<QrCodeRow, "id" | "final_url">>();
  if (!data) return null;
  return { qrId: data.id, finalUrl: data.final_url };
}

export interface ScanEventInput {
  qrCodeId: string;
  userAgent: string | null;
  referrer: string | null;
  country: string | null;
}

/**
 * Records a scan event. Intended to be called fire-and-forget from the redirect
 * handler — failures are swallowed so they never block the user's redirect.
 */
export async function recordScan(input: ScanEventInput): Promise<void> {
  try {
    const supabase = createServiceRoleSupabaseClient();
    await supabase.from("qr_scans").insert({
      qr_code_id: input.qrCodeId,
      user_agent: input.userAgent,
      referrer: input.referrer,
      country: input.country,
    });
  } catch {
    // Never block a redirect on telemetry.
  }
}

/**
 * Returns recent scan rows for a QR code (most recent first).
 * Goes through the authenticated client so RLS gates access.
 */
export async function listRecentScans(qrCodeId: string, limit = 20): Promise<QrScanRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("qr_scans")
    .select("*")
    .eq("qr_code_id", qrCodeId)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as QrScanRow[];
}

/**
 * Returns total scan count for a QR code.
 */
export async function countScans(qrCodeId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("qr_scans")
    .select("id", { count: "exact", head: true })
    .eq("qr_code_id", qrCodeId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Returns a per-day scan count series for the last `days` days (inclusive of today),
 * filling in zeros for days with no scans.
 */
export async function dailyScanSeries(
  qrCodeId: string,
  days = 14,
): Promise<DailyScanPoint[]> {
  const supabase = await createServerSupabaseClient();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const { data, error } = await supabase
    .from("qr_scans")
    .select("scanned_at")
    .eq("qr_code_id", qrCodeId)
    .gte("scanned_at", since.toISOString());

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ scanned_at: string }>) {
    const day = isoDay(row.scanned_at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const out: DailyScanPoint[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < days; i++) {
    const day = cursor.toISOString().slice(0, 10);
    out.push({ day, count: counts.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
