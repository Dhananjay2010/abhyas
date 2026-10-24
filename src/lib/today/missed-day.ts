/**
 * Missed-day detection for the Today screen.
 *
 * A day is only "missed" if:
 * 1. It was a training day in the block's template
 * 2. It occurred AFTER max(signup day, program start) — the signup day itself is never missed
 * 3. It occurred after the user's onboarding completion
 * 4. No choice was made for that day in THIS program (no planned override, no completed strength)
 *
 * The guards exist to prevent spurious "missed yesterday" prompts on day 1 and
 * when the user starts at an unaligned weekday.
 */

import { localDateString } from "@/lib/dates";
import { ownsPlannedWorkout, countsTowardStreak } from "@/lib/progress/training-days";
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
  sessions: Array<{ 
    actual_type: DayType | null; 
    status: string; 
    program_id: string | null;
    working_set_count?: number;
  }>;
  /** Whether the user has ever started any training session (null = unknown) */
  hasStartedAny: boolean | null;
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
  // If hasStartedAny is null (unknown state), treat as false (no missed prompt on error)
  if (!hasStartedAny) {
    return false;
  }

  // Not a strength training day in the template
  // Use the shared rule: only weights/bodyweight count
  if (!ownsPlannedWorkout(templateDayType)) {
    return false;
  }

  // Guard: "too new to have missed anything"
  // Two separate guards with different semantics:
  // 1. Signup day (profile.created_at local) can NEVER be missed: use <= (lenient on first day)
  // 2. Program start day CAN be missed: use strict < (block day 1 can count as missed)
  //
  // This prevents "missed yesterday" on signup day, but allows it after block rebuilds
  // when the user actually skips day 1 of a new block.
  
  // Signup day guard: date <= createdAtLocal (signup day never counts as missed)
  if (profileCreatedAt) {
    const createdAtLocal = localDateString(timezone, new Date(profileCreatedAt));
    if (date <= createdAtLocal) {
      return false;
    }
  }
  
  // Program start guard: date < programStartedOn (strict - day 1 CAN be missed)
  if (date < programStartedOn) {
    return false;
  }

  // Check if any choice was made for this day IN THIS PROGRAM:
  // 1. A completed session that counts toward streaks (weights/bodyweight/yoga)
  //    Per streak rule: a completed strength session (1+ working sets), bodyweight, or yoga settles the day.
  //    Skipped sessions (0 working sets) do NOT settle the day.
  //    Important: Completed strength sessions with 0 working sets are NOT workouts and don't settle the day.
  const settledBySession = sessions.some(
    (s) => 
      s.status === "completed" && 
      countsTowardStreak(s.actual_type, s.status, s.working_set_count) && 
      s.program_id === programId
  );
  if (settledBySession) {
    return false;
  }

  // 2. An in_progress strength or bodyweight session in this program settles the day
  //    (ownership decision from #32: this rule now lives here, not in the page)
  const hasInProgressWorkout = sessions.some(
    (s) =>
      s.program_id === programId &&
      s.status === "in_progress" &&
      (s.actual_type === "weights" || s.actual_type === "bodyweight")
  );
  if (hasInProgressWorkout) {
    return false;
  }

  // 3. A Rest/Yoga/Breathing choice (planned or in_progress) for this program
  //    Anytime breathing (program_id null) does NOT settle a missed strength day.
  //    Note: completed yoga/breathing are handled above via countsTowardStreak.
  const hasPlannedChoice = sessions.some(
    (s) =>
      s.program_id === programId &&
      (s.status === "planned" || s.status === "in_progress") &&
      (s.actual_type === "rest" || s.actual_type === "yoga" || s.actual_type === "meditation")
  );
  if (hasPlannedChoice) {
    return false;
  }

  // Skipped sessions (0 working sets) or planned-but-never-started sessions DO count as missed
  return true;
}
