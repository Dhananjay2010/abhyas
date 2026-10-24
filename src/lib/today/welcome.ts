/**
 * Check if the welcome card should be shown (server-side).
 *
 * @param hasStartedAnySession - true if user has any session with started_at
 * @param hasDismissedCookie - true if the dismiss cookie is set
 * @returns true if the card should be shown
 */
export function shouldShowWelcome(
  hasStartedAnySession: boolean,
  hasDismissedCookie: boolean
): boolean {
  // Never show if user has started a session or dismissed it
  return !hasStartedAnySession && !hasDismissedCookie;
}
