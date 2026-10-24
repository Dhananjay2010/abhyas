/**
 * Missed-day detection for the Today screen.
 *
 * A day is only "missed" if:
 * 1. It was a training day in the block's template
 * 2. It occurred on or after the program started_on date
 * 3. It occurred on or after the user's onboarding completion date
 * 4. No session that "owns a planned workout" was completed on that day
 *
 * This prevents showing "YOU MISSED YESTERDAY" on day 1 of a new program.
 *
 * Uses the shared ownsPlannedWorkout rule from training-days.ts:
 * Only strength (weights/bodyweight) sessions settle a day.
 * Yoga and breathing are anytime activities.
 */

import type { Database } from "@/lib/database.types";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";
import { localDateString } from "@/lib/dates";

type DayType = Database["public"]["Enums"]["day_type"];

export type MissedDayInput = {
  /** The date to check (yyyy-mm-dd) */
  date: string;
  /** The program's started_on date */
  programStartedOn: string;
  /** The user's onboarding completion timestamp */
  onboardingCompletedAt: string | null;
  /** The user's timezone (for converting onboarding timestamp to local date) */
  timezone: string;
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
    timezone,
    templateDayType,
    completedSessions,
  } = input;

  // Not a strength training day in the template
  // Use the shared rule: only weights/bodyweight count
  if (!ownsPlannedWorkout(templateDayType)) {
    return false;
  }

  // Before program started
  if (date < programStartedOn) {
    return false;
  }

  // Before onboarding completed (if we have that date)
  // Convert the UTC timestamp to the user's local date
  if (onboardingCompletedAt) {
    const onboardingDate = localDateString(timezone, new Date(onboardingCompletedAt));
    if (date < onboardingDate) {
      return false;
    }
  }

  // Check if any strength session was completed
  // Use the shared rule from training-days.ts
  const strengthCompleted = completedSessions.some(
    (s) => s.status === "completed" && ownsPlannedWorkout(s.actual_type)
  );

  return !strengthCompleted;
}
