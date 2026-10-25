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

// ============================================================================
// PR-OWNED: Extended version with rest seconds and null/invalid timestamp handling
// ============================================================================

export type StaleFinishInputExtended = {
  /** ISO timestamp the session started (may be null or invalid). */
  startedAt: string | null;
  /** completed_at of the latest logged set (warm-up or working), or null if none. */
  lastSetCompletedAt: string | null;
  /** Working sets only (is_warmup_set = false). */
  workingSetCount: number;
  /** Planned rest seconds for the last logged set's exercise. When undefined (not passed), ends at last set with no rest added (main's behavior). When passed but null/non-finite, becomes 300s. Clamped to [0, 300]. */
  restSeconds?: number | null;
};

export type StaleFinishExtended = {
  durationSeconds: number | null;
  endedAt: string;
  status: "completed" | "skipped";
};

/**
 * Extended finish logic for PR: handles rest seconds and null/invalid timestamps.
 * 
 * Returns `durationSeconds: null` when timestamps are invalid (null, empty, or non-ISO).
 * This prevents measuring from epoch or writing 1970-01-01 to completed_at.
 * 
 * If any sets were logged:
 *   - When restSeconds is undefined (not passed): ended_at = last_set.completed_at (main's behavior)
 *   - When restSeconds is passed: ended_at = last_set.completed_at + rest interval
 *   Rest interval uses the exercise's planned rest_seconds, clamped to [0, 300] seconds.
 *   If passed but null/non-finite, uses 300s default.
 *
 * If no sets logged:
 *   ended_at = started_at, duration = 0, status = skipped.
 */
export function resolveStaleFinishExtended(input: StaleFinishInputExtended): StaleFinishExtended {
  const start = input.startedAt ? Date.parse(input.startedAt) : NaN;

  // No sets logged: skipped, duration = 0
  if (input.workingSetCount <= 0) {
    const safeStartedAt = Number.isFinite(start) ? input.startedAt! : "1970-01-01T00:00:00.000Z";
    return { durationSeconds: 0, endedAt: safeStartedAt, status: "skipped" };
  }

  // Working sets exist but no last set timestamp: if started_at is valid, use it; otherwise null duration
  if (input.lastSetCompletedAt === null) {
    if (Number.isFinite(start)) {
      return { durationSeconds: 0, endedAt: input.startedAt!, status: "completed" };
    }
    return { durationSeconds: null, endedAt: "1970-01-01T00:00:00.000Z", status: "completed" };
  }

  const lastSetMs = Date.parse(input.lastSetCompletedAt);

  // Invalid timestamps with sets: return null duration instead of measuring from epoch
  if (!Number.isFinite(start) || !Number.isFinite(lastSetMs)) {
    const safeEnd = Number.isFinite(lastSetMs) ? input.lastSetCompletedAt : "1970-01-01T00:00:00.000Z";
    return { durationSeconds: null, endedAt: safeEnd, status: "completed" };
  }

  const safeStart = start;
  const safeLastSet = lastSetMs;

  // Backward compatibility: when restSeconds is undefined (not passed), end at last set (no rest added)
  let endedAtMs: number;
  if (input.restSeconds === undefined) {
    // Main's behavior: end at last set, no rest interval
    endedAtMs = safeLastSet;
  } else {
    // New behavior: add rest interval, clamped to [0, 300] seconds
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
