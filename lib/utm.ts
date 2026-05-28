import type { UtmParams } from "@/types/domain";

const UTM_KEYS: Array<[keyof UtmParams, string]> = [
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaign", "utm_campaign"],
  ["term", "utm_term"],
  ["content", "utm_content"],
];

/**
 * Appends UTM parameters to a destination URL.
 *
 * - Preserves any existing query string on `destinationUrl`.
 * - Overwrites any pre-existing utm_* params on the destination with the provided values.
 * - Skips empty/undefined UTM values.
 *
 * Throws if `destinationUrl` is not a valid absolute URL.
 */
export function buildFinalUrl(destinationUrl: string, utm: UtmParams): string {
  const url = new URL(destinationUrl);
  for (const [key, paramName] of UTM_KEYS) {
    const value = utm[key]?.trim();
    if (value) {
      url.searchParams.set(paramName, value);
    }
  }
  return url.toString();
}

/**
 * True if the input is a syntactically valid absolute http(s) URL.
 */
export function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
