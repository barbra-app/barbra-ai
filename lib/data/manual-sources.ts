import type { ConcertManualSource } from "@/lib/domain/analytics";

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Reads a concert doc's manualSources array defensively — the field is
// admin-written and older docs won't have it at all.
export function manualSources(value: unknown): ConcertManualSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || !data.id || typeof data.platform !== "string" || !data.platform) return [];
    return [{
      id: data.id,
      platform: data.platform,
      // Sources saved before the status existed default to on.
      active: data.active !== false,
      impressions: metric(data.impressions),
      clicks: metric(data.clicks),
      conversions: metric(data.conversions),
      ctr: metric(data.ctr),
      billedSpend: metric(data.billedSpend),
      notes: typeof data.notes === "string" ? data.notes : "",
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    }];
  });
}
