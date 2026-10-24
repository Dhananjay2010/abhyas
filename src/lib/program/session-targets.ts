import type { Database } from "@/lib/database.types";
import { applyDeload, type Prescription } from "./prescription";

type ProgramDayExercise = Database["public"]["Tables"]["program_day_exercises"]["Row"];
type Metric = Database["public"]["Enums"]["exercise_metric"];

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
 *
 * Rep/hold trim (L2 deload):
 * When context.loadReducible is explicitly false AND context.isDeload is true,
 * AND the sets were not cut (deload sets === planned sets), AND context.metric
 * is provided, trim reps or holds:
 * - Reps (metric "reps"): multiply min/max by 2/3, round, minimum 1, preserve min ≤ max
 * - Holds (metric "seconds"): multiply by 2/3, round to nearest 5s, minimum 10s
 *
 * When context.loadReducible is omitted (undefined), behaviour is exactly as before,
 * ensuring existing callers remain unchanged. When context.metric is omitted, trim
 * is skipped to avoid incorrectly trimming holds as reps.
 */
export function resolveSessionTargets(
  planned: PlannedExercise,
  context: { isDeload: boolean; loadReducible?: boolean; metric?: Metric },
): Prescription {
  const prescription: Prescription = {
    sets: planned.target_sets,
    repsMin: planned.target_reps_min,
    repsMax: planned.target_reps_max,
    restSeconds: planned.rest_seconds,
  };

  if (!context.isDeload) {
    return prescription;
  }

  const deloaded = applyDeload(prescription);

  // Apply rep/hold trim only when:
  // 1. loadReducible is explicitly false (not undefined)
  // 2. Sets were not cut (deload sets === planned sets)
  // 3. metric is provided (to avoid trimming holds as reps)
  if (
    context.loadReducible === false &&
    deloaded.sets === planned.target_sets &&
    context.metric !== undefined
  ) {
    const metric = context.metric;

    if (metric === "seconds") {
      // Holds: multiply by 2/3, round to nearest 5s, minimum 10s
      const trimmedMin = Math.max(
        10,
        Math.round((deloaded.repsMin * 2) / 3 / 5) * 5
      );
      const trimmedMax = Math.max(
        10,
        Math.round((deloaded.repsMax * 2) / 3 / 5) * 5
      );
      return {
        ...deloaded,
        repsMin: Math.min(trimmedMin, planned.target_reps_min),
        repsMax: Math.min(trimmedMax, planned.target_reps_max),
      };
    } else {
      // Reps: multiply by 2/3, round, minimum 1, preserve min ≤ max
      const trimmedMinBeforeCap = Math.max(1, Math.round((deloaded.repsMin * 2) / 3));
      const trimmedMaxBeforeCap = Math.max(1, Math.round((deloaded.repsMax * 2) / 3));
      // Cap after applying floor to ensure 0 becomes 1
      const trimmedMin = Math.min(trimmedMinBeforeCap, Math.max(1, planned.target_reps_min));
      const trimmedMax = Math.min(Math.max(trimmedMinBeforeCap, trimmedMaxBeforeCap), Math.max(1, planned.target_reps_max));
      return {
        ...deloaded,
        repsMin: trimmedMin,
        repsMax: trimmedMax,
      };
    }
  }

  return deloaded;
}
