/**
 * Pure form logic for delete-account form.
 * Extracted for testing without mocking React hooks or Next.js server actions.
 */

export type DeletionResult = { ok: true } | { ok: false; error: string };

/**
 * Convert a deletion result or thrown error into a user-friendly error message.
 * 
 * - If result is undefined or null, returns null (handles Next.js redirect case)
 * - If result is success, returns null (no error)
 * - If result is error, returns the error message
 * - If an exception was thrown, returns a fixed friendly message and logs the detail
 * 
 * This prevents raw exception messages from being shown to users.
 */
export function deleteErrorMessage(
  resultOrError: DeletionResult | { thrown: unknown } | undefined | null
): string | null {
  // Handle undefined or null (can happen when Next.js redirects)
  if (resultOrError === undefined || resultOrError === null) {
    return null;
  }
  
  // Check if it's a thrown error wrapper
  if ("thrown" in resultOrError) {
    const err = resultOrError.thrown;
    // Log the technical detail for debugging
    console.error("Account deletion error:", err);
    // Always show the same friendly message for network/fetch failures
    return "Couldn't reach the server. Check your connection and try again.";
  }

  // It's a result from the action
  if (resultOrError.ok) {
    return null;
  }

  return resultOrError.error;
}
