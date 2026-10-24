import type { Database } from "@/lib/database.types";

type ProgramDayExercise = Database["public"]["Tables"]["program_day_exercises"]["Row"];

export type PlannedExercise = Pick<
  ProgramDayExercise,
  "target_sets" | "target_reps_min" | "target_reps_max" | "rest_seconds"
>;

export type SessionTargets = {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

export type SessionContext = {
  isDeload: boolean;
  sessionMinutes?: number;
};

/**
 * Resolve working session targets from a planned exercise.
 *
 * Applies deload reductions (week 4 of every block: less volume, nothing near
 * failure) and session-length pacing adjustments in one place.
 *
 * Deload week applies a 0.6x multiplier to sets, clamped to never exceed the
 * planned sets and never go below 1. A 1-set exercise stays at 1; 0 stays 0.
 *
 * Session-length pacing (45 minutes or less) reduces sets by 1, with a floor
 * of 2, to maintain exercise coverage without overrunning time. This is applied
 * BEFORE deload scaling, so a short session's adjusted sets are also the cap
 * for deload.
 */
export function resolveSessionTargets(
  planned: PlannedExercise,
  context: SessionContext,
): SessionTargets {
  let sets = planned.target_sets;

  // QA feedback: 45 min sessions were cutting exercises but keeping 4 sets each,
  // still overrunning time. Reduce sets for shorter sessions to keep coverage.
  if (context.sessionMinutes !== undefined && context.sessionMinutes <= 45) {
    sets = Math.max(2, sets - 1);
  }

  // Week 4 of every block is a deload: less volume, nothing near failure.
  // Deload sets = max(1, round(sets * 0.6)), and never more than the normal sets.
  if (context.isDeload) {
    sets = Math.min(sets, Math.max(1, Math.round(sets * 0.6)));
  }

  return {
    sets,
    repsMin: planned.target_reps_min,
    repsMax: planned.target_reps_max,
    restSeconds: planned.rest_seconds,
  };
}
