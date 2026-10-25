import { countWorkingSets, type SetForCounting } from "@/lib/session/count-sets";

/**
 * Determine if a completed session was ended early.
 * 
 * A session is considered "ended early" when:
 * - The session status is "completed"
 * - The number of logged working sets is less than the total planned working sets
 * 
 * @param session - The session object, or null/undefined if no session exists
 * @param exercises - Array of exercises from the session, or null
 * @returns true if the session ended early, false otherwise
 */
export function isSessionEndedEarly(
  session: { status: string | null } | null | undefined,
  exercises: Array<{
    planned_sets: number | null;
    session_sets: Array<SetForCounting>;
  }> | null,
): boolean {
  if (!session || session.status !== "completed" || !exercises) {
    return false;
  }

  const totalPlannedSets = exercises.reduce((sum, ex) => sum + (ex.planned_sets ?? 0), 0);
  const totalLoggedSets = exercises.reduce((sum, ex) => sum + countWorkingSets(ex.session_sets), 0);

  return totalLoggedSets < totalPlannedSets;
}
