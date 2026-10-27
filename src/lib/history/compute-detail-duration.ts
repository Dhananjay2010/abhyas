import { findLatestSetCompletion } from "./find-latest-set-completion";
import { computeSessionDuration } from "./compute-duration";

/**
 * Compute duration for a session detail page.
 * 
 * Used by the History detail page to compute session duration consistently with
 * the list page. For NULL duration_seconds (legacy data), finds the chronologically
 * latest set completion time across all exercises.
 * 
 * Sets are expected to be ordered by set_number as the database query returns them,
 * not by completion time. This ensures the function works correctly for multi-exercise
 * sessions like 5/5/2/2 Full Body where the highest set_number is not the latest
 * chronologically.
 */
export function computeDetailDuration(
  session: {
    duration_seconds: number | null;
    started_at: string | null;
  },
  sets: Array<{
    completed_at: string | null;
    logged_at?: string | null;
  }>
): number | null {
  const lastSetCompletedAt = findLatestSetCompletion(sets);
  return computeSessionDuration(
    session.duration_seconds,
    session.started_at,
    lastSetCompletedAt
  );
}
