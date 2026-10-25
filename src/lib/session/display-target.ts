import type { Database } from "@/lib/database.types";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

/**
 * Determine the displayed target for an exercise in the session runner.
 * 
 * For timed (seconds) exercises: prefer current_target_reps from progression when
 * available, otherwise fall back to the planned value.
 * 
 * For rep-based exercises: always use the planned values.
 */
export function resolveDisplayTarget(params: {
  metric: ExerciseMetric;
  plannedMin: number;
  plannedMax: number;
  currentTargetReps: number | null | undefined;
}): { min: number; max: number } {
  const { metric, plannedMin, plannedMax, currentTargetReps } = params;

  if (metric === "seconds" && currentTargetReps != null && currentTargetReps > 0) {
    return { min: currentTargetReps, max: currentTargetReps };
  }

  return { min: plannedMin, max: plannedMax };
}
