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
  /** Whether the user has ever started any training session */
  hasStartedAny: boolean;
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
    hasStartedAny,
  } = input;

  // Day-one guard: user has never started any training, so can't have missed anything
  if (!hasStartedAny) {
    return false;
  }

  // Not a strength training day in the template
  // Use the shared rule: only weights/bodyweight count
  if (!ownsPlannedWorkout(templateDayType)) {
    return false;
  }

  // Guard: "too new to have missed anything"
  // Defense-in-depth: earliestCountableDate = max(profile created_at as local date, program started_on)
  // Any date before this can never be missed, even if the template scheduled training.
  // This prevents "missed yesterday" on signup day, after block rebuilds, and for any date
  // before the member started (e.g. a plan that began 3 days before signup).
  const earliestCountableDate = (() => {
    if (!profileCreatedAt) {
      return programStartedOn;
    }
    const createdAtLocal = localDateString(timezone, new Date(profileCreatedAt));
    // Return the LATER of the two dates (max)
    return createdAtLocal > programStartedOn ? createdAtLocal : programStartedOn;
  })();

  // A date can only be missed if it's NOT BEFORE the earliest countable date
  // (days before signup are never missed, but signup day itself CAN be missed)
  if (date < earliestCountableDate) {
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
