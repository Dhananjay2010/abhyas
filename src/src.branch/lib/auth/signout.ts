"use server";

import { redirect } from "next/navigation";
import { performSignOut } from "./signout-logic";

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

