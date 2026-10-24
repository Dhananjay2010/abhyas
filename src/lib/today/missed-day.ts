/**
 * Missed-day detection for the Today screen.
 *
 * A day is only "missed" if:
 * 1. It was a training day in the block's template
 * 2. It occurred on or after the program started_on date
 * 3. It occurred on or after the user's onboarding completion date
 * 4. No session was completed on that day
 *
 * This prevents showing "YOU MISSED YESTERDAY" on day 1 of a new program.
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type MissedDayInput = {
  /** The date to check (yyyy-mm-dd) */
  date: string;
  /** The program's started_on date */
  programStartedOn: string;
  /** The user's onboarding completion timestamp */
  onboardingCompletedAt: string | null;
  /** The day template for that weekday */
  templateDayType: DayType | null;
  /** Sessions completed on that date */
  completedSessions: Array<{ actual_type: DayType | null; status: string }>;
};

/**
 * Check if a date represents a missed training day.
 *
 * Returns true only when:
 * - The template scheduled strength training (weights or bodyweight)
 * - The date is on or after program start
 * - The date is on or after onboarding completion
 * - No strength session was completed on that date
 */
export function isMissedTrainingDay(input: MissedDayInput): boolean {
  const {
    date,
    programStartedOn,
    onboardingCompletedAt,
    templateDayType,
    completedSessions,
  } = input;

  // Not a training day in the template
  if (templateDayType !== "weights" && templateDayType !== "bodyweight") {
    return false;
  }

  // Before program started
  if (date < programStartedOn) {
    return false;
  }

  // Before onboarding completed (if we have that date)
  if (onboardingCompletedAt) {
    const onboardingDate = onboardingCompletedAt.slice(0, 10);
    if (date < onboardingDate) {
      return false;
    }
  }

  // Check if any strength session was completed
  const strengthCompleted = completedSessions.some(
    (s) =>
      s.status === "completed" &&
      (s.actual_type === "weights" || s.actual_type === "bodyweight")
  );

  return !strengthCompleted;
}
