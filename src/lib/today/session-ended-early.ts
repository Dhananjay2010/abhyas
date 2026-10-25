/**
 * Determine if a completed session was ended early.
 * 
 * A session is considered "ended early" when:
 * - The session status is "completed"
 * - At least one exercise remains in "pending" status
 * 
 * @param session - The session object, or null/undefined if no session exists
 * @param exercises - Array of exercises from the session, or null
 * @returns true if the session ended early, false otherwise
 */
export function isSessionEndedEarly(
  session: { status: string | null } | null | undefined,
  exercises: Array<{ status: string | null }> | null,
): boolean {
  if (!session || session.status !== "completed" || !exercises) {
    return false;
  }

  return exercises.some((ex) => ex.status === "pending");
}
