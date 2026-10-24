/**
 * Pure helper to decide equipment update logic (server-side).
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

/**
 * Client-side decision for equipment UI updates.
 * Prevents showing unsaveable states and decides whether to call the server.
 */
export function decideClientEquipmentUpdate(input: {
  currentHasAll: boolean;
  currentEquipmentIds: string[];
  action: "toggle" | "chip-click";
  chipId?: string;
}): 
  | { allow: true; newHasAll: boolean; newEquipmentIds: string[] }
  | { allow: false; hint: string } {
  
  const { currentHasAll, currentEquipmentIds, action, chipId } = input;
  
  if (action === "toggle") {
    const nextHasAll = !currentHasAll;
    
    // Turning OFF with empty equipment: don't save, show picker with neutral hint
    if (!nextHasAll && currentEquipmentIds.length === 0) {
      return { 
        allow: false, 
        hint: "Pick what you have, and we'll update your plan." 
      };
    }
    
    // Otherwise allow the toggle
    return { 
      allow: true, 
      newHasAll: nextHasAll, 
      newEquipmentIds: currentEquipmentIds 
    };
  }
  
  if (action === "chip-click" && chipId) {
    const isSelected = currentEquipmentIds.includes(chipId);
    
    // Deselecting the last chip: don't allow, show hint
    if (isSelected && currentEquipmentIds.length === 1) {
      return { 
        allow: false, 
        hint: 'Keep at least one, or turn on "I have access to everything".' 
      };
    }
    
    // Otherwise allow the chip toggle
    const newEquipmentIds = isSelected
      ? currentEquipmentIds.filter(id => id !== chipId)
      : [...currentEquipmentIds, chipId];
    
    return { 
      allow: true, 
      newHasAll: false, 
      newEquipmentIds 
    };
  }
  
  return { allow: false, hint: "" };
}

/**
 * Returns the confirmation message to show when turning off "I have access to everything".
 * @param wasSaved - true if equipment was just saved, false if showing the picker
 */
export function getEquipmentOffMessage(wasSaved: boolean): string {
  return wasSaved
    ? "Saved. Your plan will use only the equipment you pick."
    : "Showing your saved equipment. Pick what you have.";
}
