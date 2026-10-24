import { isBodyweightEquipment } from "../program/bodyweight";

export type SwappedExerciseFields = {
  isBodyweight: boolean;
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
};

/**
 * Compute derived fields for a swapped exercise.
 *
 * Used in session-runner swap onSuccess to update fields that depend on the
 * new exercise's equipment and progress (e.g., isBodyweight determines UI labels,
 * working/suggested weights come from the new exercise's own progression).
 */
export function swappedEntryFields(swapped: {
  equipmentIds: string[];
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
}): SwappedExerciseFields {
  return {
    isBodyweight: isBodyweightEquipment(swapped.equipmentIds),
    workingWeightKg: swapped.workingWeightKg,
    suggestedWeightKg: swapped.suggestedWeightKg,
  };
}

export type SwapSheetState = {
  isEmpty: boolean;
  message: string;
  showSkipButton: boolean;
};

/**
 * Determine swap sheet state based on alternatives list.
 *
 * Used in session-runner to show the correct empty state message and Skip button.
 */
export function swapSheetState(options: {
  alternatives: unknown[];
}): SwapSheetState {
  const isEmpty = options.alternatives.length === 0;
  return {
    isEmpty,
    message: isEmpty ? "No safe swap for this one. You can skip it." : "",
    showSkipButton: isEmpty,
  };
}
