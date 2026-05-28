import "server-only";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CurrentUser, ProfileRow } from "@/types/domain";

/**
 * Sign a user in with email and password. Returns null on success, or an error code
 * string that callers can map to translation keys.
 *
 * Auth abstraction note: this layer hides the provider so a future signInWithOAuth({ provider: 'google' })
 * can be added alongside without changing callers.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  return null;
}

/**
 * Register a new user. They land as role='client' via the auth.users insert trigger.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return error.message;
  return null;
}

/**
 * Sign the current session out.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}

/**
 * Returns the currently authenticated user + their profile, or null if anonymous.
 *
 * The profile row is normally created by the on_auth_user_created trigger. If it's
 * missing (e.g. the trigger was added after the user signed up, or the trigger
 * didn't fire), we lazy-create it here so the rest of the app keeps a clean
 * invariant: an authenticated user always has a profile.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (existing) {
    return {
      userId: user.id,
      email: user.email ?? null,
      profile: existing,
      role: existing.role,
    };
  }

  // Self-heal: create the missing profile under the user's session
  // (RLS policy `profiles_insert_own` allows insert where id = auth.uid()).
  const { data: created } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    })
    .select("*")
    .single<ProfileRow>();

  if (!created) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: created,
    role: created.role,
  };
}

/**
 * Convenience: get current user or redirect to /login. Use from server-rendered pages
 * that require an authenticated user — middleware also gates these routes, but this
 * gives a typed non-null result inside the page body.
 */
export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

/**
 * Convenience: require admin role or redirect.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const current = await requireUser();
  if (current.role !== "admin") redirect("/dashboard");
  return current;
}
