import { isSessionExpired } from "@/lib/auth/session-expired";
import { isOfflineError } from "@/lib/offline-error";

/**
 * Format error messages for the session runner.
 * Replaces raw SESSION_EXPIRED errors with a friendly message.
 * Replaces network/offline errors with a calm inline note.
 */
export function runnerErrorMessage(err: unknown): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (isOfflineError(err)) {
    return "Saved on this phone, syncing when online";
  }
  
  if (err instanceof Error) {
    return err.message;
  }
  
  return "Network error. Check your connection.";
}
