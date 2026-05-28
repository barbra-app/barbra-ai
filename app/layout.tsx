import type { Metadata } from "next";

import { I18nProvider } from "@/i18n/provider";
import { getMessages } from "@/i18n/config";
import { getLocale } from "@/i18n/server";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agency Hub",
  description: "Self-serve marketing tools for agency clients.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
