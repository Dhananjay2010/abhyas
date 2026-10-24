/**
 * Exercise and session completion helpers.
 * 
 * TODO: When Dev 3's PR #37 is merged, replace with shared implementation.
 */

/**
 * Determine exercise completion status based on logged vs planned sets.
 * 
 * Rules (coordinator's nm-06):
 * - 0 working sets logged → 'skipped'
 * - All planned sets logged → 'completed'
 * - Some but not all planned sets logged → 'partial'
 * 
 * Partial exercises count toward volume, PRs, and streaks.
 * 
 * @param loggedWorkingSets - Number of working sets logged
 * @param plannedSets - Total number of sets planned
 * @returns 'completed' | 'partial' | 'skipped'
 */
export function exerciseCompletion(
  loggedWorkingSets: number,
  plannedSets: number | undefined | null
): "completed" | "partial" | "skipped" {
  // No working sets logged
  if (loggedWorkingSets === 0) {
    return "skipped";
  }

  // No plan information available, assume completed
  if (plannedSets === undefined || plannedSets === null || plannedSets === 0) {
    return "completed";
  }

  // Completed all planned sets
  if (loggedWorkingSets >= plannedSets) {
    return "completed";
  }

  // Logged some but not all planned sets
  return "partial";
}

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
