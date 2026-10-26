import { isSessionExpired } from "@/lib/auth/session-expired";

/**
 * Format error messages for the session runner.
 * Replaces raw SESSION_EXPIRED errors with a friendly message.
 */
export function runnerErrorMessage(err: unknown): string {
  if (isSessionExpired(err)) {
    return "Your session has expired, please sign in again";
  }
  
  if (err instanceof Error) {
    return err.message;
  }
  
  return "Network error. Check your connection.";
}
