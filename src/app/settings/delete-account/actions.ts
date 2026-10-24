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
 * On failure, returns an error and KEEPS the user signed in so they can
 * retry or contact support.
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
    
    // Provide user-friendly error messages based on the error type
    let message = "Failed to delete account. Please try again or contact support.";
    
    // If the RPC function doesn't exist (migration not applied yet)
    if (error.code === "42883" || error.message?.includes("function") || error.message?.includes("does not exist")) {
      message = "Account deletion is not available yet. The system administrator needs to apply a database migration. Please contact support.";
    }
    // If there's a permission issue
    else if (error.code === "42501" || error.message?.includes("permission")) {
      message = "Permission denied. Please contact support.";
    }
    // If there's a connection issue
    else if (error.message?.includes("network") || error.message?.includes("timeout")) {
      message = "Network error. Please check your connection and try again.";
    }
    
    // Return error WITHOUT signing out - user stays logged in to retry
    return { 
      ok: false, 
      error: message
    };
  }

  // Sign out and redirect to landing page
  // The user is already deleted, so this just clears the session
  await supabase.auth.signOut();
  redirect("/");
}
