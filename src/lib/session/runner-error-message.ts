import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";

/**
 * Format error messages for the session runner.
 * Replaces raw SESSION_EXPIRED errors and provides honest, actionable messages.
 */
export function runnerErrorMessage(err: unknown): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (isOfflineError(err)) {
    return "You're offline. That set wasn't saved yet, tap Log set again when you're back online.";
  }
  
  if (err instanceof Error) {
    // Check for explicit server errors
    if (err.message === "Internal Server Error" || err.message.includes("500")) {
      return "Something went wrong on our side. That set wasn't saved, please try again.";
    }
    return err.message;
  }
  
  return "Network error. Check your connection.";
}
