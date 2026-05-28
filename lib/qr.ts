import QRCode from "qrcode";

/**
 * Renders a QR code for `text` as a PNG and returns the raw bytes.
 * Server-side only (uses the qrcode node renderer).
 */
export async function renderQrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/**
 * Builds the short tracking URL the QR will encode.
 * e.g. https://app.example.com/r/abcd1234
 */
export function buildTrackingUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/r/${slug}`;
}
