import { decideAbandonStatus } from "./abandon-session";
import { resolveStaleFinishExtended } from "./stale-duration";
import { isStaleSession } from "./is-stale-session";
import { exerciseCompletion } from "./completion";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import type { FinishSessionDeps } from "./finish-session-deps";

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Core idempotent session finish logic.
 *
 * Extracted from the server action for testability. Only the first call that
 * transitions from in_progress to completed/skipped applies the outcome. Concurrent
 * or repeated calls return success without double-applying.
 *
 * Product rule: If the user logged at least one working set, the session counts
 * as completed (not skipped). Only a session with no working sets at all is marked skipped.
 * Warm-up sets don't count as training.
 *
 * For stale sessions (past-day or >3h idle), uses resolveStaleFinish to cap duration
 * at the last logged set instead of recording unrealistic times.
 */
export async function finishSessionCore(
  deps: FinishSessionDeps,
  params: {
    sessionId: string;
    durationSeconds: number;
    cooldownCompleted: boolean;
  },
): Promise<Result<{ status: "completed" | "skipped" }>> {
  // Query session metadata for stale detection
  const { data: session, error: sessionError } = await deps.loadSession(params.sessionId);

  if (sessionError) return { ok: false, error: sessionError };
  if (!session) return { ok: false, error: "Session not found" };

  // Load member's timezone
  const { data: timezoneData, error: timezoneError } = await deps.loadTimezone(session.user_id);
  if (timezoneError) return { ok: false, error: timezoneError };

  const timezone = resolveTimezoneWithProfile(timezoneData?.timezone);

  // Check if any working sets were logged and get last set timestamp
  const { data: exercises, error: readError } = await deps.loadExercises(params.sessionId);

  if (readError) return { ok: false, error: readError };

  // Count working sets and find the last logged set timestamp and its exercise rest
  let workingSetCount = 0;
  let lastSetCompletedAt: string | null = null;
  let lastSetRestSeconds: number | null = null;

  for (const exercise of exercises ?? []) {
    for (const set of exercise.session_sets ?? []) {
      if (!set.is_warmup_set) {
        workingSetCount++;
      }
      if (set.completed_at && (!lastSetCompletedAt || set.completed_at > lastSetCompletedAt)) {
        lastSetCompletedAt = set.completed_at;
        lastSetRestSeconds = exercise.rest_seconds;
      }
    }
  }

  const now = deps.now?.() ?? new Date().toISOString();

  // If started_at is null, treat as stale and save null duration like main did
  const startedAt = session.started_at;

  // Check if session is stale (null or invalid timestamps are treated as stale)
  const stale = !startedAt || isStaleSession({
    startedAt,
    now,
    timezone,
  });

  let status: "completed" | "skipped";
  let endedAt: string;
  let durationSeconds: number | null;

  if (stale) {
    // Use stale finish logic
    const staleFinish = resolveStaleFinishExtended({
      startedAt,
      lastSetCompletedAt,
      workingSetCount,
      restSeconds: lastSetRestSeconds,
    });

    // Invalid timestamps: use now for completed_at, null for duration
    // User must never be stuck unable to finish
    if (staleFinish.endedAt === null) {
      status = staleFinish.status;
      endedAt = now; // Use injected now (never 1970)
      durationSeconds = null;
    } else {
      status = staleFinish.status;
      endedAt = staleFinish.endedAt;
      durationSeconds = staleFinish.durationSeconds;
    }
  } else {
    // Normal finish: use now and client-provided duration
    status = decideAbandonStatus(exercises ?? []);
    endedAt = now;
    durationSeconds = params.durationSeconds;
  }

  // Clamp duration to sane range: 0 to 6 hours, or keep null for invalid timestamps
  const clampedDuration = durationSeconds === null
    ? null
    : Math.max(0, Math.min(21600, Math.round(durationSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-application on retry.
  const { error, updatedCount } = await deps.updateSession(params.sessionId, {
    status,
    completed_at: status === "completed" ? endedAt : null,
    duration_seconds: clampedDuration,
    cooldown_completed: status === "completed" ? params.cooldownCompleted : undefined,
  });

  if (error) return { ok: false, error };

  // If 0 rows were updated, the session was already finished - re-read the actual status
  if (updatedCount === 0) {
    const { data: statusData, error: rereadError } = await deps.loadSessionStatus(params.sessionId);

    if (rereadError) return { ok: false, error: rereadError };
    if (!statusData) return { ok: false, error: "Session not found on re-read" };

    // The session should be completed or skipped (not in_progress) since update matched 0 rows
    if (statusData.status === "in_progress") {
      return { ok: false, error: "Session still in_progress after retry" };
    }

    return { ok: true, data: { status: statusData.status } };
  }

  // Update exercise statuses based on logged vs planned sets
  const { data: exercisesForStatus, error: exerciseReadError } = await deps.loadExercisesForUpdate(params.sessionId);

  if (exerciseReadError) {
    return { ok: false, error: exerciseReadError };
  }

  // Update each exercise status if still pending
  for (const ex of exercisesForStatus ?? []) {
    if (ex.status !== "pending") continue;

    const workingSets = (ex.session_sets ?? []).filter((s) => !s.is_warmup_set).length;
    const completion = exerciseCompletion(workingSets, ex.planned_sets ?? 0);

    // Map completion status to database enum: "partial" counts as "completed"
    const dbStatus = completion === "completed" || completion === "partial" ? "completed" : "skipped";

    const updateError = await deps.updateExerciseStatus(ex.id, dbStatus);
    if (updateError.error) {
      // Non-fatal: exercise status update failed but session was marked finished
      console.error(`Failed to update exercise ${ex.id} status:`, updateError.error);
    }
  }

  return { ok: true, data: { status } };
}
