/**
 * Session finish guard helpers.
 * 
 * Determines whether a session can be finished based on pending set state.
 */

/**
 * Get finish button text based on pending sets.
 * 
 * Always returns "Done" - the pending count is shown in the notice above.
 */
export function getFinishButtonText(): string {
  return "Done";
}
