/**
 * Compute runner exercise defaults after swap
 * Extracted from session-runner.tsx for testing
 */

import { effectiveRepsMax } from "../program/effective-target";
import { swappedEntryFields } from "./swap";

export type SwapResponse = {
  metric: string;
  repsMin: number;
  repsMax: number;
  equipmentIds: string[];
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  targetReps: number | null;
};

export type CurrentExercise = {
  repsMax: number;
};

export function runnerSwapDefaults(current: CurrentExercise, swapped: SwapResponse) {
  const swappedFields = swappedEntryFields({
    equipmentIds: swapped.equipmentIds,
    workingWeightKg: swapped.workingWeightKg,
    suggestedWeightKg: swapped.suggestedWeightKg,
  });

  const effectiveMax = effectiveRepsMax({
    plannedMax: swapped.repsMax ?? current.repsMax,
    progressedTarget: swapped.targetReps,
    isBodyweight: swappedFields.isBodyweight,
    usedWeight: swappedFields.workingWeightKg,
  });

  return {
    metric: swapped.metric,
    repsMin: swapped.repsMin,
    repsMax: effectiveMax,
    isBodyweight: swappedFields.isBodyweight,
    workingWeightKg: swappedFields.workingWeightKg,
    suggestedWeightKg: swappedFields.suggestedWeightKg,
  };
}
