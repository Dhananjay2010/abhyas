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
export function getFinishButtonText(pendingCount: number): string {
  return "Done";
}
