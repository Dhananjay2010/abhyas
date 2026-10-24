import { exerciseCompletion } from "./completion";
import type { AbandonSessionDeps } from "./abandon-session-deps";

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
  // Check if any working sets were logged
  const { data: exercises, error: readError } = await deps.loadExercises(sessionId);

  if (readError) return { ok: false, error: readError };

  const status = decideAbandonStatus(exercises ?? []);

  // Clamp duration to sane range: 0 to 6 hours
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(elapsedSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
  // The client's elapsed time is cumulative (wall clock from started_at).
  const { error } = await deps.updateSession(sessionId, {
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    duration_seconds: clampedDuration,
  });

  if (error) return { ok: false, error };

  // Update exercise statuses based on logged vs planned sets
  const { data: exercisesForStatus, error: exerciseReadError } = await deps.loadExercisesForUpdate(sessionId);

  if (exerciseReadError) {
    return { ok: false, error: exerciseReadError };
  }

  // Update each exercise status if still pending
  for (const ex of exercisesForStatus ?? []) {
    if (ex.status !== "pending") continue;

    const workingSets = (ex.session_sets ?? []).filter((s) => !s.is_warmup_set).length;
    const completion = exerciseCompletion(workingSets, ex.planned_sets);

    // Map completion status to database enum: "partial" counts as "completed"
    const dbStatus = completion === "completed" || completion === "partial" ? "completed" : "skipped";

    const updateError = await deps.updateExerciseStatus(ex.id, dbStatus);
    if (updateError.error) {
      // Non-fatal: exercise status update failed but session was marked abandoned
      console.error(`Failed to update exercise ${ex.id} status:`, updateError.error);
    }
  }

  return { ok: true, data: { status } };
}
