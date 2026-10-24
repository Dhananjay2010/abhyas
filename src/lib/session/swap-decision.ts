/**
 * Pure decision logic for swap action
 */

import { isBodyweightEquipment } from "../program/bodyweight";
import { suggestedWeight, type ExerciseMeta } from "../program/progression";

export type SwapInput = {
  newExerciseProgress: {
    currentWorkingWeightKg: number | null;
    currentTargetReps: number | null;
  } | null;
  planningMode: string | null;
  isDeload: boolean;
  exerciseMeta: {
    mechanic: ExerciseMeta["mechanic"];
    movementPattern: ExerciseMeta["movementPattern"];
    metric: ExerciseMeta["metric"];
    equipmentIds: string[];
  };
  repsMin: number;
  repsMax: number;
};

export type SwapResult = {
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  targetReps: number | null;
  metric: "reps" | "seconds";
  repsMin: number;
  repsMax: number;
  equipmentIds: string[];
};

/**
 * Compute swap result from NEW exercise's progress and context.
 * 
 * Decision tree:
 * 1. If planning_mode is "daily_menu", ignore progress (weights = null)
 * 2. Otherwise use new exercise's progress
 * 3. Calculate suggested weight based on deload flag
 */
export function buildSwapResult(input: SwapInput): SwapResult {
  const remembersWeights = input.planningMode !== "daily_menu";
  
  const workingWeightKg =
    remembersWeights && input.newExerciseProgress
      ? input.newExerciseProgress.currentWorkingWeightKg
      : null;

  const targetReps =
    remembersWeights && input.newExerciseProgress
      ? input.newExerciseProgress.currentTargetReps
      : null;

  const isBodyweight = isBodyweightEquipment(input.exerciseMeta.equipmentIds);

  const meta: ExerciseMeta = {
    mechanic: input.exerciseMeta.mechanic,
    movementPattern: input.exerciseMeta.movementPattern,
    metric: input.exerciseMeta.metric,
    isBodyweight,
    progressionChain: null,
    progressionRank: null,
  };

  const suggestedWeightKg = suggestedWeight(
    { currentWorkingWeightKg: workingWeightKg },
    input.isDeload,
    meta
  );

  return {
    workingWeightKg,
    suggestedWeightKg,
    targetReps,
    metric: input.exerciseMeta.metric,
    repsMin: input.repsMin,
    repsMax: input.repsMax,
    equipmentIds: input.exerciseMeta.equipmentIds,
  };
}
