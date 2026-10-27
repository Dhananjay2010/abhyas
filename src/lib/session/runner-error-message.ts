import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";

/**
 * Format error messages for the session runner.
 * Replaces raw SESSION_EXPIRED errors, offline errors, and 5xx errors with friendly messages.
 */
export function runnerErrorMessage(err: unknown): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (isOfflineError(err)) {
    return "Saved on this device, will sync when you're back online";
  }
  
  if (err instanceof Error) {
    // Check for 5xx server errors
    if (err.message.match(/5\d{2}/) || err.message.toLowerCase().includes("internal server error")) {
      return "Server error. Your data is saved, we'll retry automatically.";
    }
    return err.message;
  }
  
  return "Network error. Check your connection.";
}
