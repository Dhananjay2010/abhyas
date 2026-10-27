/**
 * Sign out the current user.
 *
 * This function is extracted so it can be tested with injectable dependencies.
 * The real implementation calls Supabase's signOut method.
 *
 * Only signs out the current device (local scope). A future "sign out everywhere"
 * option would use { scope: "global" }.
 * 
 * Returns {ok: true} on success or {ok: false, error: string} on failure.
 * The caller is responsible for redirecting or clearing localStorage.
 */
export async function performSignOut(deps: {
  signOut: () => Promise<{ error: Error | null }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await deps.signOut();
  if (error) {
    // Log the actual error for debugging, but return a generic message
    console.error("Sign-out failed:", error.message);
    return { ok: false, error: "Sign-out failed" };
  }
  return { ok: true };
}
