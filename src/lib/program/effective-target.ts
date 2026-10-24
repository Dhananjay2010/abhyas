/**
 * Effective target for timer and success check. Bodyweight and hold exercises
 * progress by raising the target; if that happened, use the progressed value
 * instead of the planned one so the timer counts down from the right number
 * and the success check uses the current goal.
 *
 * Only applies to bodyweight exercises with no added weight. Loaded exercises
 * always use the planned target.
 */
export function effectiveRepsMax(input: {
  plannedMax: number;
  progressedTarget: number | null | undefined;
  isBodyweight: boolean;
  usedWeight: number | null;
}): number {
  const { plannedMax, progressedTarget, isBodyweight, usedWeight } = input;
  // Loaded exercises or bodyweight with added weight use planned target
  if (!isBodyweight || (usedWeight !== null && usedWeight > 0)) return plannedMax;
  // Unloaded bodyweight uses progressed target if available
  return progressedTarget ?? plannedMax;
}
