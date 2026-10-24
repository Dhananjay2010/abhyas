/**
 * Effective target for timer and success check. Bodyweight and hold exercises
 * progress by raising the target; if that happened, use the progressed value
 * instead of the planned one so the timer counts down from the right number
 * and the success check uses the current goal.
 */
export function effectiveRepsMax(
  plannedMax: number,
  progressedTarget: number | null | undefined,
  usedWeight: number | null,
): number {
  if (usedWeight !== null && usedWeight > 0) return plannedMax;
  return progressedTarget ?? plannedMax;
}
