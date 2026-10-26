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
  beforeRedirect?: () => void;
}): Promise<{ ok: false; error: string }> {
  const { error } = await deps.signOut();
  if (error) {
    // Log the actual error for debugging, but return a generic message
    console.error("Sign-out failed:", error.message);
    return { ok: false, error: "Sign-out failed" };
  }
  // Call cleanup hook before redirect (e.g. clearing pending queues)
  deps.beforeRedirect?.();
  // If signOut succeeds, redirect immediately. The redirect throws, so the
  // return type Promise<never | { ok: false }> is correct but TS needs help.
  deps.redirect("/");
}
