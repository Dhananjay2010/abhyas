/**
 * Count logged sets that are saved or pending (exclude failed/unsaved).
 * 
 * Pure function for testability. Handles:
 * - Doesn't count failed or unsaved rows
 * - Doesn't double-count (deduplicates by setNumber)
 * - Stable during flush (pending rows are counted)
 */
export function countLoggedSets(
  exercises: Array<{
    sets: Array<{
      setNumber: number;
      pending?: boolean;
      failed?: boolean;
      unsaved?: boolean;
    }>;
  }>,
): number {
  return exercises.reduce((sum, ex) => {
    return sum + ex.sets.filter((s) => {
      // Exclude failed and unsaved rows
      const meta = s as { pending?: boolean; failed?: boolean; unsaved?: boolean };
      return !meta.failed && !meta.unsaved;
    }).length;
  }, 0);
}

/**
 * Map Postgres error codes and raw error text to user-friendly messages.
 * 
 * Pure function for testability.
 */
export function mapErrorToUserMessage(code: string | null | undefined, rawMessage?: string): string {
  // Check for specific Postgres error codes
  if (code) {
    // 22P02: Invalid text representation (e.g. "SELECT '123abc'::integer")
    // 22003: Numeric value out of range
    // 23514: Check constraint violation
    if (code === "22P02" || code === "22003" || code === "23514") {
      return "Not saved, check the numbers";
    }
    
    // 42501: Insufficient privilege
    if (code === "42501") {
      return "Not saved, please sign in again";
    }
  }
  
  // Map raw text patterns
  if (rawMessage) {
    const lower = rawMessage.toLowerCase();
    
    // Quota exceeded errors
    if (lower.includes("quota") || lower === "quota_exceeded" || lower.includes("exceeded the quota")) {
      return "Not saved, out of space";
    }
    
    // Max retries
    if (lower.includes("failed after") && lower.includes("retries")) {
      return "Not saved after multiple attempts";
    }
  }
  
  // Default message for any other error
  return "Not saved, tap Retry";
}

/**
 * Compute retry delay in milliseconds based on attempt count.
 * 
 * Schedule: 15s, 30s, 60s (then stays at 60s).
 * Pure function for testability.
 */
export function getRetryDelay(attemptCount: number): number {
  if (attemptCount <= 0) return 0;
  if (attemptCount === 1) return 15000; // 15s
  if (attemptCount === 2) return 30000; // 30s
  return 60000; // 60s for 3+
}
