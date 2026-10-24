/**
 * Pure account deletion logic extracted for testing.
 * 
 * These functions contain the business logic for account deletion with
 * injected dependencies, making them testable without mocking Next.js or Supabase.
 */

import { getSiteInfo } from "@/lib/legal/site-info";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Get the names of all Supabase auth cookies that should be deleted.
 * 
 * Supabase auth cookies all start with 'sb-' prefix. This helper filters
 * a list of all cookie names to find the auth-related ones.
 * 
 * Exported as a pure function for testing.
 * 
 * @param allCookieNames - All cookie names currently set
 * @returns Array of auth cookie names to delete
 */
export function authCookieNames(allCookieNames: string[]): string[] {
  return allCookieNames.filter(name => name.startsWith("sb-"));
}

export interface DeletionDeps {
  user: { id: string; email: string | null } | null;
  callRPC: () => Promise<{ error: unknown }>;
  signOut: () => Promise<{ error: unknown } | void>;
  redirect: () => never;
}

/**
 * Map database/RPC errors to user-friendly messages.
 * Exported for testing.
 * 
 * Technical details are logged to the console; users see friendly messages.
 */
export function mapDeletionError(error: { code?: string; message?: string }): string {
  const { supportEmail } = getSiteInfo();
  
  // If there's a permission issue (check first, before function-related checks)
  if (error.code === "42501" || error.message?.includes("permission denied")) {
    return "Permission denied. Please contact support.";
  }

  // If the RPC function doesn't exist (migration not applied yet)
  // Don't tell users about database migrations - they can't fix it
  if (
    error.code === "42883" ||
    error.message?.includes("does not exist")
  ) {
    return `Account deletion isn't available right now. Please contact support at ${supportEmail}.`;
  }

  // If there's a connection issue
  if (error.message?.includes("network") || error.message?.includes("timeout")) {
    return "Network error. Please check your connection and try again.";
  }

  // Generic error
  return "Failed to delete account. Please try again or contact support.";
}

/**
 * Perform account deletion with injected dependencies.
 * 
 * This is the core deletion logic separated from Next.js and Supabase specifics.
 * Testable by injecting mock dependencies.
 * 
 * Flow:
 * 1. Check authentication
 * 2. Call RPC to delete account
 * 3. On error: return error, user stays signed in
 * 4. On success: sign out (local scope) and redirect
 */
export async function performAccountDeletion(deps: DeletionDeps): Promise<Result> {
  const { user, callRPC, signOut, redirect } = deps;

  // Check authentication
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  // Call the RPC function that handles deletion
  const { error } = await callRPC();

  if (error) {
    console.error("Account deletion error:", error);

    // Map to user-friendly message
    const message = mapDeletionError(error as { code?: string; message?: string });

    // Return error WITHOUT signing out - user stays logged in to retry
    return {
      ok: false,
      error: message,
    };
  }

  // Success: the user no longer exists in the database
  // Sign out with local scope (no server call needed since user is deleted)
  const signOutResult = await signOut();
  
  // Check for sign-out errors
  // Even if sign-out fails, we continue to delete cookies and redirect
  // because the account is already deleted
  if (signOutResult && "error" in signOutResult && signOutResult.error) {
    console.error("Sign-out error after successful deletion:", signOutResult.error);
  }
  
  redirect();
  // TypeScript: redirect() never returns, but we need a return statement for type checking
  return { ok: true };
}
