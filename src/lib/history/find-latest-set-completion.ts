/**
 * Find the chronologically latest set completion time.
 *
 * Returns the max completed_at/logged_at across all sets, not the highest set_number.
 * This ensures multi-exercise sessions (e.g. 5/5/2/2 Full Body) use the actual last
 * set chronologically, not just the last set by number.
 *
 * Used by both the list builder and detail page so they always agree.
 */
export function findLatestSetCompletion(
  sets: Array<{ completed_at: string | null; logged_at?: string | null }>
): string | null {
  if (sets.length === 0) return null;

  const validSets = sets.filter(set => set.completed_at !== null || set.logged_at !== null);
  if (validSets.length === 0) return null;

  // Sort by the timestamp (completed_at or logged_at)
  const sorted = validSets.sort((a, b) => {
    const aTime = a.completed_at ?? a.logged_at ?? "";
    const bTime = b.completed_at ?? b.logged_at ?? "";
    return aTime.localeCompare(bTime);
  });

  const last = sorted[sorted.length - 1];
  return last.completed_at ?? last.logged_at ?? null;
}
