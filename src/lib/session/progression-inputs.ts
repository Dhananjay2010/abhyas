/**
 * Extract equipment IDs and unit preference for progression functions.
 * 
 * Returns empty object for no-equipment exercises to maintain backward compatibility
 * with main's behavior (undefined equipmentIds/unit).
 */

import type { WeightUnit } from "@/lib/session/equipment-grid";

export function progressionInputsFromExercise(
  exercise: { equipment_ids: string[] },
  userUnits: string | null | undefined,
): { equipmentIds?: string[]; unit?: WeightUnit } {
  // No equipment: return empty object (undefined equipmentIds/unit)
  if (!exercise.equipment_ids || exercise.equipment_ids.length === 0) {
    return {};
  }
  
  // Has equipment: return equipmentIds and unit
  const unit: WeightUnit = userUnits === "imperial" ? "lb" : "kg";
  return {
    equipmentIds: exercise.equipment_ids,
    unit,
  };
}
