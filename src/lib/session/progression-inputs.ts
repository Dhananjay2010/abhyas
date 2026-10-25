/**
 * Extract equipment IDs for progression functions.
 * 
 * Returns empty object for no-equipment exercises to maintain backward compatibility
 * with main's behavior (undefined equipmentIds).
 * 
 * M2: Units removed - all messages stay in kg until runner supports imperial.
 */

export function progressionInputsFromExercise(
  exercise: { equipment_ids: readonly string[] },
): { equipmentIds?: string[] } {
  // No equipment: return empty object (undefined equipmentIds)
  if (!exercise.equipment_ids || exercise.equipment_ids.length === 0) {
    return {};
  }
  
  // Has equipment: return equipmentIds only (kg always)
  return {
    equipmentIds: [...exercise.equipment_ids],
  };
}
