import type { WeightUnit } from "@/lib/session/equipment-grid";

/**
 * Extract progression inputs from a session exercise for equipment-aware progression.
 * 
 * Returns the equipment IDs, unit preference, and exercise type needed for
 * equipment-grid-aware weight progression. Used by both applyProgression
 * (actions.ts) and suggestedWeight (session page loader).
 * 
 * Pure function: no I/O, testable, usable from src/lib or src/app.
 */
export function progressionInputsFromExercise(
  exercise: {
    mechanic: string | null;
    equipment_ids: string[];
  },
  userUnits: string | null | undefined,
): {
  equipmentIds: string[];
  unit: WeightUnit;
  mechanic: string | null;
} {
  const unit: WeightUnit = userUnits === "imperial" ? "lb" : "kg";
  
  return {
    equipmentIds: exercise.equipment_ids ?? [],
    unit,
    mechanic: exercise.mechanic,
  };
}
