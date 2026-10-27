import { buildDetailDurationInput } from "./build-detail-duration-input";
import { computeDetailPageDuration } from "./compute-detail-page-duration";

/**
 * Build session duration from raw sets for history detail page.
 * 
 * This is the page's data path: raw sets → buildDetailDurationInput → computeDetailPageDuration.
 * Extracted as a pure function for testing.
 * 
 * @param session - Session with duration_seconds and started_at
 * @param sets - All sets (warm-ups and working)
 * @returns Duration in seconds, or null if no duration can be determined
 */
export function buildSessionDuration(
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
  const durationInput = buildDetailDurationInput(sets);
  return computeDetailPageDuration(session, durationInput);
}
