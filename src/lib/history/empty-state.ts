/**
 * Pure function to determine History page empty state.
 * 
 * @param itemsLen - Number of items in the current page
 * @param filter - Current filter tab
 * @param counts - Session counts per filter
 * @param hasErrors - Whether any data fetch errors occurred
 * @returns The empty state to render
 */
export type SessionType = "lifts" | "yoga" | "breathing";

export function historyEmptyState(
  itemsLen: number,
  filter: SessionType,
  counts: Record<SessionType, number>,
  hasErrors: boolean
): "populated" | "error" | "true-empty" | "filtered-empty" | "page-empty" {
  if (itemsLen > 0) return "populated";
  if (hasErrors) return "error";
  // QA3 LOW-4: this tab has sessions, just none on this page (e.g. a stale ?page=).
  if (counts[filter] > 0) return "page-empty";
  const total = counts.lifts + counts.yoga + counts.breathing;
  return total === 0 ? "true-empty" : "filtered-empty";
}
