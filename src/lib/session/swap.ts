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
