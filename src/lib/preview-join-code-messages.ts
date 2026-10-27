/**
 * Maps preview join code results to user-facing messages.
 */

import type { PreviewJoinCodeResult } from "./gym-join-code-types";

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

/**
 * Maps a preview join code result to a user-facing error message.
 * Returns empty string for success, specific message for each failure reason.
 */
export function mapPreviewResultToMessage(result: PreviewJoinCodeResult): string {
  if (result.ok) return "";
  
  const reason = result.reason;
  
  if (reason === "invalid") {
    return "This invite code is invalid, expired, or no longer available.";
  }
  
  if (reason === "throttled") {
    return "You've made too many attempts. Please try again in a few minutes.";
  }
  
  return assertNever(reason);
}
