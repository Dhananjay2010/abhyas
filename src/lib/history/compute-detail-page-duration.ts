import { computeDetailDuration } from "./compute-detail-duration";

/**
 * Compute duration for the history detail page.
 * 
 * Filters to working sets (drops warm-ups) before computing duration,
 * ensuring the detail page and list page use the same logic.
 * 
 * @param session - Session with duration_seconds and started_at
 * @param sets - All sets (warm-ups and working)
 * @returns Duration in seconds, or null if no duration can be determined
 */
export function computeDetailPageDuration(
  session: {
    duration_seconds: number | null;
    started_at: string | null;
  },
  sets: Array<{
    completed_at: string | null;
    logged_at?: string | null;
    is_warmup_set: boolean;
  }>
): number | null {
  // Filter to working sets only (QA LOW A)
  const workingSets = sets.filter(s => !s.is_warmup_set);
  return computeDetailDuration(session, workingSets);
}
