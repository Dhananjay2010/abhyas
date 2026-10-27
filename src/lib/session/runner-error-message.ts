import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";

/**
 * Detect if an error represents a 5xx server error.
 * Checks for:
 * - Exact match: "Internal Server Error"
 * - Pattern: "status 5XX" where XX is any two digits
 * 
 * Does NOT match:
 * - "Weight 500 kg is above the max" (no "status" keyword)
 * - "Set 1500 rejected" (no "status" keyword)
 */
function is5xxError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  
  const message = err.message;
  
  // Exact match for common 5xx messages
  if (message === "Internal Server Error") return true;
  if (message === "500 Internal Server Error") return true;
  
  // Pattern: "status 5XX" or "Status 5XX" (case insensitive)
  // This matches "status 500", "status 503", etc. but not "Weight 500" or "Set 1500"
  if (/\bstatus\s+5\d\d\b/i.test(message)) return true;
  
  return false;
}

/**
 * Format error messages for the session runner.
 * Replaces raw SESSION_EXPIRED errors and provides honest, actionable messages.
 * 
 * @param err - The error to format
 * @param kind - Whether this is a 'set' action (logging a set) or generic 'action' (undo, skip, finish)
 */
export function runnerErrorMessage(err: unknown, kind: 'set' | 'action' = 'set'): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (isOfflineError(err)) {
    if (kind === 'set') {
      return "You're offline. That set wasn't saved yet, tap Log set again when you're back online.";
    } else {
      return "You're offline. That didn't go through, try again when you're back online.";
    }
  }
  
  if (is5xxError(err)) {
    if (kind === 'set') {
      return "Something went wrong on our side. That set wasn't saved, please try again.";
    } else {
      return "Something went wrong on our side. Please try again.";
    }
  }
  
  if (err instanceof Error) {
    return err.message;
  }
  
  return "Network error. Check your connection.";
}
