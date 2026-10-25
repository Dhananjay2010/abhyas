/**
 * Determine if yesterday should show a "missed day" prompt.
 *
 * Returns true when:
 * - yesterday was a training day (weights or bodyweight)
 * - no completed strength session exists for yesterday
 * - yesterday falls on or after the program started (not before signup)
 *
 * The start date guard prevents showing "You missed yesterday" to a user
 * on their very first Today, where "yesterday" is before they even joined.
 */
export function isMissedYesterday({
  yesterday,
  programStartedOn,
  yesterdayIsTrainingDay,
  hadCompletedStrengthYesterday,
}: {
  yesterday: string;
  programStartedOn: string | null;
  yesterdayIsTrainingDay: boolean;
  hadCompletedStrengthYesterday: boolean;
}): boolean {
  // If started_on is null, keep the current behaviour: check only training day + completion.
  // This preserves existing logic when the column is unset.
  if (programStartedOn === null) {
    return yesterdayIsTrainingDay && !hadCompletedStrengthYesterday;
  }

  // Don't show "missed yesterday" if yesterday was before the program started.
  if (yesterday < programStartedOn) {
    return false;
  }

  return yesterdayIsTrainingDay && !hadCompletedStrengthYesterday;
}
