"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import { translate, type Locale, type Messages } from "./config";

interface I18nContextValue {
  locale: Locale;
  messages: Messages;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(messages, key, vars),
    [messages],
  );
  const value = useMemo<I18nContextValue>(
    () => ({ locale, messages, t }),
    [locale, messages, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Client-side i18n hook. Must be used under an I18nProvider.
 */
export function useTranslations(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used inside an I18nProvider.");
  return ctx;
}
