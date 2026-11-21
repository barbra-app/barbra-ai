const SOURCE_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  dv360: "DV360",
};

export function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}

// Which sources feed each segment breakdown — not every ad platform reports
// every dimension (e.g. Pinterest has no device/geo/demographics breakdown
// at all). Mirrors the source CTEs in each fact_* breakdown Dataform
// definition — keep in sync if those change.
export const DEVICE_GEO_SOURCES = ["meta_ads", "google_ads", "tiktok_ads", "dv360"];
export const DEMOGRAPHICS_SOURCES = ["meta_ads", "google_ads", "tiktok_ads"];
export const PLATFORM_BREAKDOWN_SOURCES = ["meta_ads", "google_ads"];
