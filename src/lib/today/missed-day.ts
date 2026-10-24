/**
 * Missed-day detection for the Today screen.
 *
 * A day is only "missed" if:
 * 1. It was a training day in the block's template
 * 2. It occurred on or after the program started_on date
 * 3. It occurred on or after the user's onboarding completion date
 * 4. No choice was made for that day (no planned override, no completed strength)
 *
 * This prevents showing "YOU MISSED YESTERDAY" on day 1 of a new program.
 *
 * A Rest/Yoga/Breathing choice settles a day (planned/in_progress/completed/skipped).
 * A completed strength session also settles a day.
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
  /** Sessions for that date */
  sessions: Array<{ actual_type: DayType | null; status: string }>;
};

/**
 * Check if a date represents a missed training day.
 *
 * Returns true only when:
 * - The template scheduled strength training (weights or bodyweight)
 * - The date is on or after program start
 * - The date is on or after onboarding completion
 * - No choice was made: no Rest/Yoga/Breathing override (planned/in_progress/completed/skipped)
 *   and no completed strength session
 */
export function isMissedTrainingDay(input: MissedDayInput): boolean {
  const {
    date,
    programStartedOn,
    onboardingCompletedAt,
    timezone,
    templateDayType,
    sessions,
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

  // Check if any choice was made for this day:
  // 1. A completed strength session
  const strengthCompleted = sessions.some(
    (s) => s.status === "completed" && ownsPlannedWorkout(s.actual_type)
  );
  if (strengthCompleted) {
    return false;
  }

  // 2. A Rest/Yoga/Breathing choice (planned, in_progress, completed, or skipped)
  const hasChoice = sessions.some(
    (s) =>
      (s.status === "planned" ||
        s.status === "in_progress" ||
        s.status === "completed" ||
        s.status === "skipped") &&
      (s.actual_type === "rest" || s.actual_type === "yoga" || s.actual_type === "meditation")
  );
  if (hasChoice) {
    return false;
  }

  return true;
}
