/**
 * Pending set helpers for session runner.
 */

import type { PendingSet } from "./pending-set-retry";

/**
 * Count pending sets for a specific exercise.
 * 
 * Used by the runner to determine the next set number when logging a new set.
 * Without this, replayed sets could collide with new sets on the same set_number.
 */
export function getPendingCountForExercise(
  pending: PendingSet[],
  sessionExerciseId: string
): number {
  return pending.filter(s => s.sessionExerciseId === sessionExerciseId).length;
}
