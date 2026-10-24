/**
 * Session completion label helper.
 * 
 * TODO: Replace with shared helper from Dev 3's PR #37 when it merges.
 */

/**
 * Session completion label helper.
 * 
 * @param status - Session status (e.g., "completed", "in_progress")
 * @param completedSets - Number of working sets completed
 * @param plannedSets - Total number of sets planned (optional)
 * @returns Label like "Completed" or "Ended early · 2 of 10 sets"
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
    const word = plannedSets === 1 ? "set" : "sets";
    return `Ended early · ${completedSets} of ${plannedSets} ${word}`;
  }

  return "Completed";
}
