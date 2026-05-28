const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Generates a random URL-safe slug of the requested length.
 * Uses crypto.getRandomValues for unbiased selection.
 */
export function generateSlug(length = 7): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET.charAt(bytes[i]! % SLUG_ALPHABET.length);
  }
  return out;
}

/**
 * Normalizes a user-supplied slug:
 *   - lowercased
 *   - non [a-z0-9-] characters replaced with `-`
 *   - leading/trailing/duplicate dashes collapsed
 * Returns null if the result is not a valid slug.
 */
export function normalizeSlug(input: string): string | null {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return SLUG_REGEX.test(normalized) ? normalized : null;
}
