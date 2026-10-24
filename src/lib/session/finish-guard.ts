/**
 * Session finish guard helpers.
 * 
 * Determines whether a session can be finished based on pending set state.
 */

/**
 * Can the session be finished?
 * Returns false if there are pending sets waiting to save.
 */
export function canFinishSession(pendingCount: number): boolean {
  return pendingCount === 0;
}

/**
 * Derive finish button disabled state from pending sets and busy flag.
 */
export function isFinishDisabled(pendingCount: number, busy: boolean): boolean {
  return busy || pendingCount > 0;
}

/**
 * Get finish button text based on pending sets.
 */
export function getFinishButtonText(pendingCount: number): string {
  if (pendingCount > 0) {
    return `Saving ${pendingCount} ${pendingCount === 1 ? "set" : "sets"}…`;
  }
  return "Done";
}
