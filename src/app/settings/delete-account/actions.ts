"use server";

import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Delete the signed-in user's account and all their data.
 * 
 * Calls a SECURITY DEFINER RPC function that:
 * 1. Verifies the caller owns the account
 * 2. Deletes all user data (cascades handle child tables)
 * 3. Deletes the auth.users row
 * 
 * On success, signs the user out and redirects to the landing page.
 */
export async function deleteAccount(): Promise<Result> {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  // Call the RPC function that handles deletion
  // Type assertion needed because the database types are not yet regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("delete_own_account");

  if (error) {
    console.error("Account deletion error:", error);
    return { 
      ok: false, 
      error: "Failed to delete account. Please try again or contact support." 
    };
  }

  // Sign out and redirect to landing page
  // The user is already deleted, so this just clears the session
  await supabase.auth.signOut();
  redirect("/");
}
