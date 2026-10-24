/**
 * Pure account deletion logic extracted for testing.
 * 
 * These functions contain the business logic for account deletion with
 * injected dependencies, making them testable without mocking Next.js or Supabase.
 */

export type Result = { ok: true } | { ok: false; error: string };

export interface DeletionDeps {
  user: { id: string; email: string | null } | null;
  callRPC: () => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  redirect: () => never;
}

/**
 * Map database/RPC errors to user-friendly messages.
 * Exported for testing.
 */
export function mapDeletionError(error: { code?: string; message?: string }): string {
  // If there's a permission issue (check first, before function-related checks)
  if (error.code === "42501" || error.message?.includes("permission denied")) {
    return "Permission denied. Please contact support.";
  }

  // If the RPC function doesn't exist (migration not applied yet)
  if (
    error.code === "42883" ||
    error.message?.includes("does not exist")
  ) {
    return "Account deletion is not available yet. The system administrator needs to apply a database migration. Please contact support.";
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
 * 4. On success: sign out and redirect
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

  // Success: sign out and redirect to landing page
  // The user is already deleted from the database, this just clears the session
  await signOut();
  redirect();
  // TypeScript: redirect() never returns, but we need a return statement for type checking
  return { ok: true };
}
