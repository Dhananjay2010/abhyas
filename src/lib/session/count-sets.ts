/**
 * Count working sets (exclude warmups, include both reps-based and timed).
 * 
 * Used by both History list and detail pages to ensure consistent counts.
 * A working set is one where:
 * - is_warmup_set = false (or null for safety)
 * - Has either reps OR duration_seconds (logged data)
 * 
 * This matches what users see in the detail page per-exercise breakdowns.
 */

export interface SetForCounting {
  is_warmup_set: boolean | null;
  reps: number | null;
  duration_seconds: number | null;
}

/**
 * Count working sets in a session.
 * 
 * @param sets - Array of sets with is_warmup_set, reps, and duration_seconds
 * @returns Number of working sets (non-warmup sets with logged data)
 */
export function countWorkingSets(sets: SetForCounting[]): number {
  return sets.filter((s) => {
    // Exclude warmup sets
    if (s.is_warmup_set) return false;
    
    // Include if it has reps OR duration (logged working set)
    return (s.reps !== null && s.reps > 0) || (s.duration_seconds !== null && s.duration_seconds > 0);
  }).length;
}
