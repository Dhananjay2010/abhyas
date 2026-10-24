/**
 * Missed-day detection for the Today screen.
 *
 * A day is only "missed" if:
 * 1. It was a training day in the block's template
 * 2. It occurred AFTER the program started_on date (signup day itself never missed)
 * 3. It occurred on or after the user's onboarding completion date
 * 4. No choice was made for that day in THIS program (no planned override, no completed strength)
 *
 * The guards exist to prevent spurious "missed yesterday" prompts on day 1 and
 * when the user starts at an unaligned weekday.
 */

import { localDateString } from "@/lib/dates";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";
import type { Database } from "@/lib/database.types";

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
  /** The program ID (to filter only choices for this program) */
  programId: string;
  /** Sessions for that date */
  sessions: Array<{ actual_type: DayType | null; status: string; program_id: string | null }>;
};

/**
 * Check if a date represents a missed training day.
 *
 * Returns true only when:
 * - The template scheduled strength training (weights or bodyweight)
 * - The date is AFTER program start (signup day itself never missed)
 * - The date is on or after onboarding completion
 * - No choice was made in this program: no Rest/Yoga/Breathing override (planned/in_progress/completed/skipped)
 *   and no completed strength session
 */
export function isMissedTrainingDay(input: MissedDayInput): boolean {
  const {
    date,
    programStartedOn,
    onboardingCompletedAt,
    timezone,
    templateDayType,
    programId,
    sessions,
  } = input;

  // Not a strength training day in the template
  // Use the shared rule: only weights/bodyweight count
  if (!ownsPlannedWorkout(templateDayType)) {
    return false;
  }

  // Guard 1: Check if the date is before or on the program start (signup day itself never missed)
  if (date <= programStartedOn) {
    return false;
  }

  // Before signup: use max(program start, onboarding completion local date)
  // This handles cases where program.started_on might be set incorrectly
  // (e.g., aligned to week start) or where onboarding_completed_at is the
  // only reliable timestamp we have.
  let earliestTrainingDate = programStartedOn;
  if (onboardingCompletedAt) {
    const onboardingDate = localDateString(timezone, new Date(onboardingCompletedAt));
    // Use the LATER of the two dates (max)
    earliestTrainingDate = onboardingDate > earliestTrainingDate ? onboardingDate : earliestTrainingDate;
  }
  
  if (date < earliestTrainingDate) {
    return false;
  }

  // Check if any choice was made for this day IN THIS PROGRAM:
  // 1. A completed strength session for this program
  const strengthCompleted = sessions.some(
    (s) => s.status === "completed" && ownsPlannedWorkout(s.actual_type) && s.program_id === programId
  );
  if (strengthCompleted) {
    return false;
  }

  // 2. A Rest/Yoga/Breathing choice (planned, in_progress, completed, or skipped) for this program
  // Anytime breathing (program_id null) does NOT settle a missed strength day
  const hasChoice = sessions.some(
    (s) =>
      s.program_id === programId &&
      (s.status === "planned" ||
        s.status === "in_progress" ||
        s.status === "completed" ||
        s.status === "skipped") &&
      (s.actual_type === "rest" || s.actual_type === "yoga" || s.actual_type === "meditation")
  );
  if (hasChoice) {
    return false;
  }

  // Skipped or planned weights sessions that were never completed DO count as missed
  return true;
}
