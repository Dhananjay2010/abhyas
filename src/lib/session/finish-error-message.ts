import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";

/**
 * Format error messages for session finish paths ONLY.
 * 
 * Item 5 scope: This applies ONLY to finish-path failures:
 * - Cool-down Done
 * - Skip cool-down
 * - finish (early exercises completion)
 * - end early
 * 
 * For these paths, we ALWAYS show fixed friendly copy, never raw server text.
 * 
 * Log set, undo, and skip-exercise errors are NOT finish paths and keep main's behavior.
 * 
 * @param err - The error to format
 */
export function finishErrorMessage(err: unknown): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (isOfflineError(err)) {
    return "You're offline. That didn't go through, try again when you're back online.";
  }
  
  // Item 5 decision: finish-path failures ALWAYS show fixed friendly copy.
  // Never pass server text through (including HTML bodies, duplicate key errors, etc.)
  return "That didn't save. Try again.";
}
