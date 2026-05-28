import "server-only";

import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getMessages,
  isLocale,
  translate,
  type Locale,
  type Messages,
} from "./config";

/**
 * Reads the locale from the request cookie, falling back to DEFAULT_LOCALE.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Returns a `t(key, vars?)` translator bound to the current request's locale.
 * Use from Server Components.
 */
export async function getTranslator(): Promise<{
  locale: Locale;
  messages: Messages;
  t: (key: string, vars?: Record<string, string | number>) => string;
}> {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return {
    locale,
    messages,
    t: (key, vars) => translate(messages, key, vars),
  };
}
