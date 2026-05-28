/**
 * Formats an ISO timestamp into a locale-aware short date+time string.
 */
export function formatDateTime(iso: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Formats an ISO timestamp into just a date (no time).
 */
export function formatDate(iso: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * YYYY-MM-DD in UTC.
 */
export function isoDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
