"use server";

/**
 * Sign out server action.
 *
 * Awaits the signOut call to ensure cookies are cleared before redirecting.
 * Returns an error result on failure so the UI can show it and re-enable the button.
 * Returns success result to allow client to clear localStorage before redirect.
 *
 * Signs out only the current device (local scope).
 */
export async function signOutAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("Sign-out failed:", error.message);
    return { ok: false, error: "Sign-out failed" };
  }
  
  return { ok: true };
}

