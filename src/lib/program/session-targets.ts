import type { Database } from "@/lib/database.types";
import { applyDeload, type Prescription } from "./prescription";

type ProgramDayExercise = Database["public"]["Tables"]["program_day_exercises"]["Row"];

export type PlannedExercise = Pick<
  ProgramDayExercise,
  "target_sets" | "target_reps_min" | "target_reps_max" | "rest_seconds"
>;

/**
 * Resolve working session targets from a planned exercise.
 *
 * Applies deload reductions when context.isDeload is true.
 * Planned rows are already paced when the plan is generated, so no additional
 * session-time pacing is applied here.
 *
 * Deload week applies a 0.6x multiplier to sets, with the formula:
 * min(sets, max(2, round(sets * 0.6)))
 *
 * This ensures: 0 stays 0, 1 stays 1, 2 stays 2, and 5 becomes 3.
 * Deload sets never exceed the planned sets.
 */
export function resolveSessionTargets(
  planned: PlannedExercise,
  context: { isDeload: boolean },
): Prescription {
  const prescription: Prescription = {
    sets: planned.target_sets,
    repsMin: planned.target_reps_min,
    repsMax: planned.target_reps_max,
    restSeconds: planned.rest_seconds,
  };

  if (context.isDeload) {
    return applyDeload(prescription);
  }

  return prescription;
}
