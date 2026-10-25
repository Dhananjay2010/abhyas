/**
 * Session finish decision helpers.
 * 
 * Guards that determine when a session can be finished or abandoned.
 */

/**
 * Should we route to the cool-down screen when cool-down is disabled?
 * 
 * Yes if there are pending sets waiting to save. This prevents finishing
 * the session and leaving sets in the outbox.
 * 
 * Used by the runner at the end of the last exercise when cool-down is off.
 */
export function shouldShowCooldownForPending(
  cooldownEnabled: boolean,
  pendingCount: number
): boolean {
  return !cooldownEnabled && pendingCount > 0;
}

/**
 * Should the "End session early" button be disabled?
 * 
 * Yes while the session is busy or while there are pending sets waiting to save.
 */
export function isEndEarlyDisabled(
  busy: boolean,
  pendingCount: number
): boolean {
  return busy || pendingCount > 0;
}
