import type { AbandonSessionDeps } from "./abandon-session-deps";
import { resolveStaleFinishExtended } from "./stale-duration";
import { isStaleSession } from "./is-stale-session";

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

  const startedAt = sessionMeta?.started_at ?? null;

  // Check if any working sets were logged
  const { data: exercises, error: readError } = await deps.loadExercises(sessionId);

  if (readError) return { ok: false, error: readError };

  const status = decideAbandonStatus(exercises ?? []);

  // Determine duration: use stale logic if session is stale
  let durationSeconds: number | null;

  const stale = !startedAt || isStaleSession({
    startedAt: startedAt,
    now: new Date().toISOString(),
    timezone: "UTC",
  });

  if (stale) {
    // Load exercises with sets for stale calculation
    const { data: exercisesWithSets, error: setsError } = await deps.loadExercisesWithSets(sessionId);
    if (setsError) return { ok: false, error: setsError };

    // Find last set completed_at and rest_seconds
    let lastSetCompletedAt: string | null = null;
    let restSeconds: number | null = null;
    let workingSetCount = 0;

    for (const ex of exercisesWithSets ?? []) {
      for (const set of ex.session_sets ?? []) {
        if (!set.is_warmup_set) {
          workingSetCount++;
          if (!lastSetCompletedAt || set.completed_at > lastSetCompletedAt) {
            lastSetCompletedAt = set.completed_at;
            restSeconds = ex.rest_seconds;
          }
        }
      }
    }

    const staleFinish = resolveStaleFinishExtended({
      startedAt,
      lastSetCompletedAt,
      workingSetCount,
      restSeconds,
    });

    durationSeconds = staleFinish.durationSeconds;
  } else {
    // Non-stale: use passed elapsed time, clamped to sane range (0 to 6 hours)
    durationSeconds = Math.max(0, Math.min(21600, Math.round(elapsedSeconds)));
  }

  // Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
  const { error, updatedCount } = await deps.updateSession(sessionId, {
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    duration_seconds: durationSeconds,
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
