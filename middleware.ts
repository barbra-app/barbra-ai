import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/register", "/link-not-found"];
const AUTH_PATHS = new Set(["/login", "/register"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Tracking redirect endpoint must remain public.
  if (pathname.startsWith("/r/")) return true;
  // Auth callback flows should remain reachable.
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

/**
 * Builds a redirect response that preserves any cookies that `updateSession`
 * set on the original response (e.g. refreshed Supabase access tokens).
 * Without this, `NextResponse.redirect(url)` would strip those Set-Cookie
 * headers and the very next request would be unauthenticated again — causing
 * the redirect loop that "login doesn't work" usually looks like.
 */
function redirectWithCookies(
  request: NextRequest,
  baseResponse: NextResponse,
  pathname: string,
  searchParams?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  }
  const redirect = NextResponse.redirect(url);
  for (const cookie of baseResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

/**
 * Runs on every (non-static) request:
 *   1. Refreshes Supabase auth cookies.
 *   2. Bounces authenticated users away from /login and /register.
 *   3. Bounces anonymous users away from gated routes.
 *   4. Gates /admin/* to admin role only.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, supabase, user } = await updateSession(request);

  // Authenticated user trying to view an auth screen: send them home.
  if (user && AUTH_PATHS.has(pathname)) {
    return redirectWithCookies(request, response, "/dashboard");
  }

  if (isPublic(pathname)) return response;

  if (!user) {
    return redirectWithCookies(request, response, "/login", { next: pathname });
  }

  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: "client" | "admin" }>();

    if (profile?.role !== "admin") {
      return redirectWithCookies(request, response, "/dashboard");
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)",
  ],
};
