/**
 * Pure function to resolve display targets after a swap.
 * 
 * Self-contained for #127, works against main's swap structure.
 * After #125 merges, this will sit after #125's applySwapResult.
 * 
 * Exported for testing.
 */

import { resolveTarget } from "@/lib/session/display-target";
import type { Database } from "@/lib/database.types";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

export type SessionExerciseWithTarget = {
  id: string;
  metric: ExerciseMetric;
  repsMin: number;
  repsMax: number;
  workingWeightKg: number | null;
  [key: string]: unknown;
};

/**
 * Apply target resolution to an exercise after a swap.
 * 
 * Takes an exercise and swap data, adjusts only repsMin/repsMax
 * based on stored progression targets while keeping plan range separate.
 * 
 * @param exercise - The exercise to update
 * @param swapData - Equipment IDs, stored target, working weight, and plan range from swap
 * @returns Updated exercise with resolved display targets
 */
export function applySwapTarget<T extends SessionExerciseWithTarget>(
  exercise: T,
  swapData: {
    equipmentIds: readonly string[];
    currentTargetReps: number | null | undefined;
    currentWorkingWeightKg: number | null | undefined;
    plannedRepsMin: number;
    plannedRepsMax: number;
  }
): T {
  const target = resolveTarget({
    metric: exercise.metric,
    plannedMin: swapData.plannedRepsMin,
    plannedMax: swapData.plannedRepsMax,
    currentTargetReps: swapData.currentTargetReps,
    equipmentIds: swapData.equipmentIds,
    currentWorkingWeightKg: swapData.currentWorkingWeightKg ?? null,
  });

  return {
    ...exercise,
    repsMin: target.min,
    repsMax: target.max,
  };
}
