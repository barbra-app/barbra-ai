import en from "./locales/en.json";
import es from "./locales/es.json";

export const LOCALE_COOKIE = "locale";
export const DEFAULT_LOCALE = "en" as const;
export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];
export type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = { en, es };

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/**
 * Resolves a `dot.path` translation key against a Messages object.
 * If the key is missing, returns the key itself (visible miss — easy to spot).
 *
 * Supports {placeholder} interpolation.
 */
export function translate(
  messages: Messages,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const segments = key.split(".");
  let cursor: unknown = messages;
  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) return key;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== "string") return key;
  if (!vars) return cursor;
  return cursor.replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(vars[name] ?? `{${name}}`),
  );
}
