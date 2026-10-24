/**
 * Pure form logic for delete-account form.
 * Extracted for testing without mocking React hooks or Next.js server actions.
 */

export type DeletionResult = { ok: true } | { ok: false; error: string };

/**
 * Check if the user typed the exact confirmation word.
 * 
 * @param input - The raw user input
 * @returns true only when input is exactly "DELETE" (case-sensitive, no whitespace tolerance)
 */
export function isDeleteConfirmed(input: string): boolean {
  return input === "DELETE";
}

/**
 * Convert a deletion result or thrown error into a user-friendly error message.
 * 
 * - If result is success, returns null (no error)
 * - If result is error, returns the error message
 * - If an exception was thrown, returns a fixed friendly message and logs the detail
 * 
 * This prevents raw exception messages from being shown to users.
 */
export function deleteErrorMessage(
  resultOrError: DeletionResult | { thrown: unknown }
): string | null {
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
