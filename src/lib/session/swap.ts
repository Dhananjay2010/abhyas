import { isBodyweightEquipment } from "../program/bodyweight";

export type SwappedExerciseFields = {
  isBodyweight: boolean;
};

/**
 * Compute derived fields for a swapped exercise.
 *
 * Used in session-runner swap onSuccess to update fields that depend on the
 * new exercise's equipment (e.g., isBodyweight determines UI labels).
 */
export function swappedEntryFields(swapped: {
  equipmentIds: string[];
}): SwappedExerciseFields {
  return {
    isBodyweight: isBodyweightEquipment(swapped.equipmentIds),
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
