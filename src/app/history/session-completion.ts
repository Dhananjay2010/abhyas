/**
 * Session completion label helper.
 * 
 * TODO: Replace with shared helper from src/lib/ when sessionCompletion() is exported.
 * Another developer is adding an exported helper with this signature.
 * 
 * @param status - Session status (e.g., "completed", "in_progress")
 * @param completedSets - Number of sets completed
 * @param plannedSets - Total number of sets planned
 * @returns Label like "Completed" or "Ended early · 2/10 sets"
 */
export function sessionCompletion(
  status: string,
  completedSets?: number,
  plannedSets?: number
): string {
  if (status !== "completed") {
    return status;
  }

  // If we have set information and the session ended early
  if (
    completedSets !== undefined &&
    plannedSets !== undefined &&
    plannedSets > 0 &&
    completedSets < plannedSets
  ) {
    return `Ended early · ${completedSets}/${plannedSets} sets`;
  }

  return "Completed";
}
