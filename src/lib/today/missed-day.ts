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
  /** The user's profile created_at timestamp */
  profileCreatedAt: string | null;
  /** The user's timezone (for converting timestamps to local dates) */
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
 * - The date is after max(profile.created_at as local date, program.started_on)
 * - No choice was made in this program: no Rest/Yoga/Breathing override (planned/in_progress/completed/skipped)
 *   and no completed strength session
 *
 * The "too new to have missed anything" rule is based purely on dates:
 * - No missed prompt for any date before max(profile.created_at local date, current block's started_on)
 * - This prevents "missed yesterday" on signup day and after block rebuilds
 */
export function isMissedTrainingDay(input: MissedDayInput): boolean {
  const {
    date,
    programStartedOn,
    profileCreatedAt,
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

  // Guard: "too new to have missed anything"
  // Base on max(profile created_at as local date, current block's started_on)
  // This prevents "missed yesterday" on signup day and after block rebuilds
  let earliestPossibleMissedDate = programStartedOn;

  if (profileCreatedAt) {
    const createdAtLocal = localDateString(timezone, new Date(profileCreatedAt));
    // Use the LATER of the two dates (max)
    earliestPossibleMissedDate = createdAtLocal > earliestPossibleMissedDate
      ? createdAtLocal
      : earliestPossibleMissedDate;
  }

  // A date can only be missed if it's AFTER the earliest possible missed date
  // (signup day itself and earlier days are never missed)
  if (date <= earliestPossibleMissedDate) {
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
