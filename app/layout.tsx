import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "De datos dispersos a decisiones claras con inteligencia de medios potenciada por IA.";
  return {
    metadataBase: new URL(origin),
    title: "Barbra Intelligence",
    description,
    openGraph: {
      title: "Barbra Intelligence",
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "Barbra Intelligence" }],
    },
    twitter: { card: "summary_large_image", title: "Barbra Intelligence", description, images: [`${origin}/og.png`] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // habilita env(safe-area-inset-*) para iOS notch
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1e9" },
    { media: "(prefers-color-scheme: dark)", color: "#141319" },
  ],
};

// Applies a stored theme override before first paint so switching themes
// (or reloading with one already chosen) never flashes the other theme.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("barbra-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
      </body>
    </html>
  );
}
