/**
 * Calculate the next set number for an exercise, accounting for both completed
 * sets and pending sets that are waiting to be replayed.
 *
 * @param setsDone - Number of sets already saved to the database
 * @param pendingSetsForExercise - Number of pending sets for this exercise
 * @returns The next set number to use (1-indexed)
 */
export function nextSetNumberFor(
  setsDone: number,
  pendingSetsForExercise: number
): number {
  return setsDone + pendingSetsForExercise + 1;
}
