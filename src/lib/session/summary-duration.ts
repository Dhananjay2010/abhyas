/**
 * Decide what duration to show in the finish summary.
 *
 * For stale sessions, the saved duration (capped at last set + rest) is correct.
 * For fresh sessions, the elapsed timer is correct.
 *
 * This ensures the summary matches what History will show, never the raw wall clock.
 */
export function summaryDurationSeconds(params: {
  savedDurationSeconds: number | null;
  elapsedSeconds: number;
  isStale: boolean;
  nowMs: number;
}): number {
  // Stale sessions: use the stale-adjusted saved duration
  if (params.isStale && params.savedDurationSeconds !== null) {
    return params.savedDurationSeconds;
  }

  // Fresh sessions or null saved duration: use elapsed timer
  return params.elapsedSeconds;
}
