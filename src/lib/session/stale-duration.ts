export type StaleFinishInput = {
  /** ISO timestamp the session started. */
  startedAt: string | null;
  /** completed_at of the latest logged set (warm-up or working), or null if none. */
  lastSetCompletedAt: string | null;
  /** Working sets only (is_warmup_set = false). */
  workingSetCount: number;
  /** Planned rest seconds for the last logged set's exercise. When undefined (not passed), ends at last set with no rest added (main's behavior). When passed but null/non-finite, becomes 300s. Clamped to [0, 300]. */
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
 *   - When restSeconds is undefined (not passed): ended_at = last_set.completed_at (main's behavior)
 *   - When restSeconds is passed: ended_at = last_set.completed_at + rest interval
 *   Rest interval uses the exercise's planned rest_seconds, capped at 300s (5 min).
 *   If passed but null/non-finite, uses 300s default.
 *
 * If no sets logged:
 *   ended_at = started_at, duration = 0, status = skipped.
 *
 * Backward compatible: handles null/invalid timestamps gracefully like main.
 */
export function resolveStaleFinish(input: StaleFinishInput): StaleFinish {
  const start = Date.parse(input.startedAt ?? "");

  // No sets logged: skipped, duration = 0
  // Use startedAt or epoch if invalid, like main would
  if (input.workingSetCount <= 0 || input.lastSetCompletedAt === null) {
    const safeStartedAt = Number.isFinite(start) && input.startedAt ? input.startedAt : new Date(0).toISOString();
    return { durationSeconds: 0, endedAt: safeStartedAt, status: "skipped" };
  }

  const lastSetMs = Date.parse(input.lastSetCompletedAt);

  // Handle invalid timestamps gracefully: use the valid one or epoch
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeLastSet = Number.isFinite(lastSetMs) ? lastSetMs : safeStart;

  // Backward compatibility: when restSeconds is undefined (not passed), end at last set (no rest added)
  let endedAtMs: number;
  if (input.restSeconds === undefined) {
    // Main's behavior: end at last set, no rest interval
    endedAtMs = safeLastSet;
  } else {
    // New behavior: add rest interval
    let restMs = 300 * 1000; // default 300s
    if (input.restSeconds != null && Number.isFinite(input.restSeconds)) {
      const clamped = Math.max(0, Math.min(300, input.restSeconds));
      restMs = clamped * 1000;
    }
    endedAtMs = safeLastSet + restMs;
  }

  // Ensure ended_at >= last_set.completed_at and >= start
  const finalEndedAtMs = Math.max(safeStart, safeLastSet, endedAtMs);

  const durationSeconds = Math.floor((finalEndedAtMs - safeStart) / 1000);
  const endedAt = new Date(finalEndedAtMs).toISOString();

  return {
    durationSeconds,
    endedAt,
    status: "completed",
  };
}
