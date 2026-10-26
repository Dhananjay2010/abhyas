/**
 * Session finish guard helpers.
 * 
 * Determines whether a session can be finished based on pending set state.
 */

/**
 * Derive finish button disabled state from pending sets and busy flag.
 */
export function isFinishDisabled(pendingCount: number, busy: boolean): boolean {
  return busy || pendingCount > 0;
}

/**
 * Get finish button text based on pending sets.
 * 
 * Always returns "Done" - the pending count is shown in the notice above.
 */
export function getFinishButtonText(): string {
  return "Done";
}

/**
 * Get inline warning text when finish is blocked by pending sets.
 */
export function getFinishWarningText(pendingCount: number, hasFailed: boolean): string | null {
  if (pendingCount === 0) {
    return null;
  }
  
  if (hasFailed) {
    return `${pendingCount} ${pendingCount === 1 ? "set" : "sets"} still syncing. Connect to finish.`;
  }
  
  return `${pendingCount} ${pendingCount === 1 ? "set is" : "sets are"} syncing…`;
}
