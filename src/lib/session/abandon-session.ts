import type { AbandonSessionDeps } from "./abandon-session-deps";
import { resolveStaleFinishExtended } from "./stale-duration";
import { isStaleSession } from "./is-stale-session";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { extractLastSetMetadata } from "./last-set-metadata";

export type SessionSet = {
  id: string;
  is_warmup_set: boolean;
};

export type SessionExercise = {
  session_sets: SessionSet[] | null;
};

export type AbandonOutcome = {
  status: "completed" | "skipped";
  completed_at: string | null;
  duration_seconds: number;
};

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Decide whether a session being abandoned early should count as completed or skipped.
 *
 * The rule: if the user logged at least one working set, the session counts
 * as completed. Only a session with no working sets at all is marked skipped.
 */
export function decideAbandonStatus(
  exercises: SessionExercise[],
): "completed" | "skipped" {
  const hasWorkingSets = exercises.some((ex) => {
    const sets = ex.session_sets ?? [];
    return sets.some((s) => !s.is_warmup_set);
  });

  return hasWorkingSets ? "completed" : "skipped";
}

/**
 * Core idempotent session abandon logic.
 *
 * Extracted from the server action for testability. Only the first call that
 * transitions from in_progress to completed/skipped applies the outcome. Concurrent
 * or repeated calls return success without double-applying.
 *
 * Safety note: Completed sessions are NOT resumable (startSession only resumes
 * planned/in_progress/skipped). This is intentional - a session with working sets
 * logged counts toward streak/days trained and shows in History as completed, not
 * skipped. The tradeoff: user cannot resume after early end if they had sets.
 * Alternative would be a new status like "partial" that's resumable but counts.
 */
export async function abandonSessionCore(
  deps: AbandonSessionDeps,
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result<{ status: "completed" | "skipped" }>> {
  // Load session metadata for stale detection
  const { data: sessionMeta, error: metaError } = await deps.loadSessionMetadata(sessionId);
  if (metaError) return { ok: false, error: metaError };
  if (!sessionMeta) return { ok: false, error: "Session not found" };

  const startedAt = sessionMeta.started_at;
  const userId = sessionMeta.user_id;

  // Load profile timezone
  const { data: timezoneData, error: timezoneError } = await deps.loadTimezone(userId);
  if (timezoneError) return { ok: false, error: timezoneError };

  const timezone = resolveTimezoneWithProfile(timezoneData?.timezone);

  // Check if any working sets were logged
  const { data: exercises, error: readError } = await deps.loadExercises(sessionId);

  if (readError) return { ok: false, error: readError };

  const status = decideAbandonStatus(exercises ?? []);

  const now = deps.now?.() ?? new Date().toISOString();

  // Check if session is stale (null or invalid timestamps are treated as stale)
  const stale = !startedAt || isStaleSession({
    startedAt,
    now,
    timezone,
  });

  let durationSeconds: number | null;

  if (stale) {
    // Load exercises with sets for stale calculation
    const { data: exercisesWithSets, error: setsError} = await deps.loadExercisesWithSets(sessionId);
    if (setsError) return { ok: false, error: setsError };

    // Extract last set metadata using shared helper
    const { workingSetCount, lastSetCompletedAt, lastSetRestSeconds } = extractLastSetMetadata(exercisesWithSets ?? []);

    const staleFinish = resolveStaleFinishExtended({
      startedAt,
      lastSetCompletedAt,
      workingSetCount,
      restSeconds: lastSetRestSeconds,
    });

    durationSeconds = staleFinish.durationSeconds;
  } else {
    // Non-stale: use passed elapsed time
    durationSeconds = elapsedSeconds;
  }

  // Clamp duration to sane range: 0 to 6 hours, or keep null for invalid timestamps
  const clampedDuration = durationSeconds === null
    ? null
    : Math.max(0, Math.min(21600, Math.round(durationSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
  const { error, updatedCount } = await deps.updateSession(sessionId, {
    status,
    completed_at: status === "completed" ? now : null,
    duration_seconds: clampedDuration,
  });

  if (error) return { ok: false, error };

  // If 0 rows were updated, the session was already finished - re-read the actual status
  if (updatedCount === 0) {
    const { data: statusData, error: rereadError } = await deps.loadSessionStatus(sessionId);

    if (rereadError) return { ok: false, error: rereadError };
    if (!statusData) return { ok: false, error: "Session not found on re-read" };

    // The session should be completed or skipped (not in_progress) since update matched 0 rows
    if (statusData.status === "in_progress") {
      return { ok: false, error: "Session still in_progress after retry" };
    }

    return { ok: true, data: { status: statusData.status } };
  }

  return { ok: true, data: { status } };
}
