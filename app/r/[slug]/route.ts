import { NextResponse, type NextRequest } from "next/server";

import { recordScan, resolveSlugToTarget } from "@/services/tracking";

/**
 * GET /r/[slug]
 *
 * Public redirect endpoint. Looks up the QR by slug, fires a non-blocking scan
 * insert, and 302s to the UTM-tagged destination. If the slug is unknown we
 * render a friendly not-found page (see ./not-found.tsx).
 *
 * No session is required — the lookup runs through the service-role client.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const target = await resolveSlugToTarget(slug);

  if (!target) {
    const url = request.nextUrl.clone();
    url.pathname = "/link-not-found";
    url.search = "";
    return NextResponse.redirect(url, 302);
  }

  const userAgent = request.headers.get("user-agent");
  const referrer = request.headers.get("referer");
  // Vercel/Cloudflare/Netlify all attach country headers; pick whichever exists.
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country") ??
    null;

  // Fire-and-forget: never block the redirect on telemetry.
  void recordScan({
    qrCodeId: target.qrId,
    userAgent,
    referrer,
    country,
  });

  return NextResponse.redirect(target.finalUrl, 302);
}
