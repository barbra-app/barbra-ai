import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-side Supabase client tied to the current request's cookies.
 *
 * Use this from Server Components, Route Handlers, and Server Actions.
 * It refreshes the session via cookies when needed and runs queries under the
 * authenticated user, so RLS policies apply.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The middleware will refresh tokens, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * Only use this from trusted server-side code that genuinely needs to write data
 * the current user could not write themselves (e.g. inserting a qr_scan row from
 * the public redirect endpoint, where there is no authenticated user).
 *
 * Never import this from a Client Component.
 */
export function createServiceRoleSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — service-role client cannot be created.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
