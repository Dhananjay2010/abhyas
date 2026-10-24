/**
 * Exercise completion helper.
 * 
 * Shared with Dev 3's PR #37.
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
  plannedSets: number
): "completed" | "partial" | "skipped" {
  // No working sets logged
  if (loggedWorkingSets === 0) {
    return "skipped";
  }

  // No plan information available, assume completed
  if (plannedSets === 0) {
    return "completed";
  }

  // Completed all planned sets
  if (loggedWorkingSets >= plannedSets) {
    return "completed";
  }

  // Logged some but not all planned sets
  return "partial";
}
