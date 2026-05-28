import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Reads from public env vars and uses anon key.
 * RLS policies still apply.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
