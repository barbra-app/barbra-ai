import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Barbra — El motor de GTM",
  description:
    "Inteligencia de medios potenciada por IA. Pregunta sobre cualquier cuenta o campaña y recibe gráficos y reportes en tiempo real.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // habilita env(safe-area-inset-*) para iOS notch
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${bricolage.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)] antialiased">
        {children}
      </body>
    </html>
  );
}
