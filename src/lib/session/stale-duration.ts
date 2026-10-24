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
 */
export function resolveStaleFinish(input: StaleFinishInput): StaleFinish {
  const start = Date.parse(input.startedAt);
  if (input.workingSetCount <= 0) {
    return { durationSeconds: 0, endedAt: input.startedAt, status: "skipped" };
  }
  const last = input.lastSetCompletedAt === null ? start : Date.parse(input.lastSetCompletedAt);
  const end = Math.max(start, last);
  return {
    durationSeconds: Math.floor((end - start) / 1000),
    endedAt: new Date(end).toISOString(),
    status: "completed",
  };
}
