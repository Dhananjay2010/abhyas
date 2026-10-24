export type StaleFinishInput = {
  /** ISO timestamp the session started. */
  startedAt: string;
  /** completed_at of the latest logged set (warm-up or working), or null if none. */
  lastSetCompletedAt: string | null;
  /** Working sets only (is_warmup_set = false). */
  workingSetCount: number;
  /** Planned rest seconds for the last logged set's exercise. Null/missing/non-finite becomes 300s. Clamped to [0, 300]. */
  restSeconds?: number | null;
};

export type StaleFinish = {
  durationSeconds: number;
  endedAt: string;
  status: "completed" | "skipped";
};

/**
 * Finish values for a session closed after the fact (stale or past-day).
 *
 * If any sets were logged:
 *   ended_at = last_set.completed_at + one rest interval
 *   Rest interval uses the exercise's planned rest_seconds, capped at 300s (5 min).
 *   If no planned rest is known (null/missing/non-finite), uses 300s.
 *
 * If no sets logged:
 *   ended_at = started_at, duration = 0, status = skipped.
 *
 * ended_at must never be before the last logged set's completed_at.
 */
export function resolveStaleFinish(input: StaleFinishInput): StaleFinish {
  const start = Date.parse(input.startedAt);

  // No sets logged: skipped, duration = 0
  if (input.workingSetCount <= 0 || input.lastSetCompletedAt === null) {
    return { durationSeconds: 0, endedAt: input.startedAt, status: "skipped" };
  }

  const lastSetMs = Date.parse(input.lastSetCompletedAt);

  // Resolve rest interval: null/missing/non-finite becomes 300, clamp to [0, 300]
  let restMs = 300 * 1000; // default 300s
  if (input.restSeconds != null && Number.isFinite(input.restSeconds)) {
    const clamped = Math.max(0, Math.min(300, input.restSeconds));
    restMs = clamped * 1000;
  }

  // ended_at = last_set.completed_at + rest interval
  const endedAtMs = lastSetMs + restMs;

  // Guard: ended_at must never be before last_set.completed_at
  const finalEndedAtMs = Math.max(lastSetMs, endedAtMs);

  const durationSeconds = Math.floor((finalEndedAtMs - start) / 1000);
  const endedAt = new Date(finalEndedAtMs).toISOString();

  return {
    durationSeconds,
    endedAt,
    status: "completed",
  };
}
