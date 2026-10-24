"use server";

import { redirect } from "next/navigation";

/**
 * Sign out the current user and redirect to the landing page.
 *
 * This function is extracted so it can be tested with injectable dependencies.
 * The real implementation calls Supabase's signOut method and Next.js's redirect.
 *
 * Only signs out the current device (local scope). A future "sign out everywhere"
 * option would use { scope: "global" }.
 */
export async function performSignOut(deps: {
  signOut: () => Promise<{ error: Error | null }>;
  redirect: (url: string) => never;
}): Promise<{ ok: false; error: string }> {
  const { error } = await deps.signOut();
  if (error) {
    return { ok: false, error: error.message };
  }
  // If signOut succeeds, redirect immediately. The redirect throws, so the
  // return type Promise<never | { ok: false }> is correct but TS needs help.
  deps.redirect("/");
}

/**
 * Sign out server action.
 *
 * Awaits the signOut call to ensure cookies are cleared before redirecting.
 * Returns an error result on failure so the UI can show it and re-enable the button.
 *
 * Signs out only the current device (local scope).
 */
export async function signOutAction(): Promise<{ ok: false; error: string } | never> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  return performSignOut({
    signOut: () => supabase.auth.signOut({ scope: "local" }),
    redirect,
  });
}

