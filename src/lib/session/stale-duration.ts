export type StaleFinishInput = {
  /** ISO timestamp the session started. */
  startedAt: string;
  /** completed_at of the latest logged set (warm-up or working), or null if none. */
  lastSetCompletedAt: string | null;
  /** Working sets only (is_warmup_set = false). */
  workingSetCount: number;
};

export type StaleFinish = {
  durationSeconds: number;
  endedAt: string;
  status: "completed" | "skipped";
};

/**
 * Finish values for a session closed after the fact (stale or past-day).
 * Ends at the last logged set, never "now". No working sets: skipped, 0 s.
 * Caps duration at 4 hours to prevent unrealistic times from long-idle sessions.
 */
export function resolveStaleFinish(input: StaleFinishInput): StaleFinish {
  const start = Date.parse(input.startedAt);
  if (input.workingSetCount <= 0) {
    return { durationSeconds: 0, endedAt: input.startedAt, status: "skipped" };
  }
  const last = input.lastSetCompletedAt === null ? start : Date.parse(input.lastSetCompletedAt);
  const rawDurationMs = Math.max(0, last - start);
  
  // Cap at 4 hours
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const cappedDurationMs = Math.min(rawDurationMs, FOUR_HOURS_MS);
  const durationSeconds = Math.floor(cappedDurationMs / 1000);
  
  const endedAt = new Date(start + cappedDurationMs).toISOString();
  
  return {
    durationSeconds,
    endedAt,
    status: "completed",
  };
}
