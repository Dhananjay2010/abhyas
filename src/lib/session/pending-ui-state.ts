/**
 * UI state helpers for pending set display.
 * 
 * These helpers determine what to show to the user based on pending set state.
 */

import type { PendingSetState } from "./pending-set-controller";

export type PendingUiMode = "expired" | "replay-error" | "none";

/**
 * Determine which UI mode to show based on pending set state.
 * 
 * - "expired": Show SessionExpiredPrompt with sign-in link
 * - "replay-error": Show error message with retry button  
 * - "none": No pending UI to show
 * 
 * When expired is true, always show expired mode even if error is set.
 * This keeps the Sign-in link visible during focus retries while still signed out.
 */
export function getPendingUiMode(state: PendingSetState): PendingUiMode {
  if (state.pending.length === 0) {
    return "none";
  }
  
  // Expired takes priority - keep sign-in link visible
  if (state.expired) {
    return "expired";
  }
  
  if (state.error) {
    return "replay-error";
  }
  
  return "none";
}

/**
 * Get error message for replay-error mode, or null if not in that mode.
 */
export function getReplayErrorMessage(state: PendingSetState): string | null {
  const mode = getPendingUiMode(state);
  if (mode === "replay-error") {
    return state.error;
  }
  return null;
}
