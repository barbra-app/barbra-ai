"use server";

import {
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from "@/services/auth";

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Signs the user in. Returns the redirect target rather than calling redirect()
 * directly: redirect() thrown from a server action invoked inside a client
 * useTransition can interact awkwardly with cookie propagation in some Next.js
 * versions. The client performs a hard navigation (window.location.assign)
 * after seeing the cookies installed on the response.
 */
export async function signInAction(
  formData: FormData,
  nextPath?: string,
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const error = await signInWithPassword(email, password);
  if (error) return { ok: false, error };
  return {
    ok: true,
    redirectTo: nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard",
  };
}

export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const error = await signUpWithPassword(email, password, fullName);
  if (error) return { ok: false, error };
  // If the project requires email confirmation the user has no session yet —
  // signal success and let the UI surface the "check your email" message.
  return { ok: true, redirectTo: "/dashboard" };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  // No redirect() here: the SignOutButton performs a hard navigation client-side,
  // which sends the now-cleared cookies and avoids router-cache fights.
}
