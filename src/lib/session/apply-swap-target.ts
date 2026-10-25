/**
 * Pure function to resolve display targets after a swap.
 * 
 * This sits on top of #125's applySwapResult, which handles the weight prefill.
 * This function only adjusts repsMin/repsMax based on stored progression targets.
 * 
 * Exported for testing.
 */

import { resolveTarget } from "@/lib/session/display-target";
import type { Database } from "@/lib/database.types";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

export type SessionExerciseWithTarget = {
  id: string;
  metric: ExerciseMetric;
  plannedRepsMin: number;
  plannedRepsMax: number;
  repsMin: number;
  repsMax: number;
  workingWeightKg: number | null;
  [key: string]: unknown;
};

/**
 * Apply target resolution to an exercise after a swap.
 * 
 * Takes an exercise that has already been processed by applySwapResult (#125),
 * and adjusts only repsMin/repsMax based on stored progression targets.
 * 
 * @param exercise - The exercise after applySwapResult
 * @param equipmentIds - Equipment IDs of the swapped-in exercise
 * @param currentTargetReps - Stored target from exercise_progress
 * @returns Updated exercise with resolved display targets
 */
export function applySwapTarget<T extends SessionExerciseWithTarget>(
  exercise: T,
  equipmentIds: readonly string[],
  currentTargetReps: number | null | undefined,
): T {
  // Use the replacement's plan range from server (already set by applySwapResult)
  const target = resolveTarget({
    metric: exercise.metric,
    plannedMin: exercise.plannedRepsMin,
    plannedMax: exercise.plannedRepsMax,
    currentTargetReps,
    equipmentIds,
    currentWorkingWeightKg: exercise.workingWeightKg,
  });

  return {
    ...exercise,
    repsMin: target.min,
    repsMax: target.max,
  };
}
