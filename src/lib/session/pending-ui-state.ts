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
 * - "replay-error": Show error message from failed replay (not session expired)
 * - "expired": Show session expired prompt
 * - "none": No pending UI to show
 */
export function getPendingUiMode(state: PendingSetState): PendingUiMode {
  if (state.pending.length === 0) {
    return "none";
  }
  
  if (state.error) {
    return "replay-error";
  }
  
  return "expired";
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
