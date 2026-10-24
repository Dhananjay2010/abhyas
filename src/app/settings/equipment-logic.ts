/**
 * Pure helper to decide equipment update logic.
 * Separated from actions.ts because "use server" files require all exports to be async.
 */
export function decideEquipmentUpdate(input: {
  currentHasAll: boolean;
  currentEquipmentIds: string[];
  newHasAll: boolean;
  newEquipmentIds: string[];
}): { action: "write"; changed: boolean } | { action: "skip" } | { action: "error"; error: string } {
  const { currentHasAll, currentEquipmentIds, newHasAll, newEquipmentIds } = input;
  
  // Validate: cannot save empty list with hasAll false
  if (!newHasAll && newEquipmentIds.length === 0) {
    return { 
      action: "error", 
      error: 'Pick at least one item, or turn on "I have access to everything".' 
    };
  }
  
  // Check if equipment actually changed
  const hasAllChanged = currentHasAll !== newHasAll;
  const sortedCurrent = [...currentEquipmentIds].sort();
  const sortedNew = [...newEquipmentIds].sort();
  const equipmentIdsChanged = 
    sortedCurrent.length !== sortedNew.length ||
    sortedCurrent.some((id, i) => id !== sortedNew[i]);
  
  const changed = hasAllChanged || equipmentIdsChanged;
  
  if (!changed) {
    return { action: "skip" };
  }
  
  return { action: "write", changed: true };
}
