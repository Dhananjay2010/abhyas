import { exerciseCompletion } from "./completion";

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

// Minimal Supabase client interface
export interface SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

// Narrow any Supabase-like client to our interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asSupabaseClient(client: any): SupabaseClient {
  return client;
}

/**
 * Decide whether a session being abandoned early should count as completed or skipped.
 *
 * Product rule: If the user logged at least one working set, the session counts
 * as completed (not skipped). Only a session with no working sets at all is marked skipped.
 * Warm-up sets don't count as training.
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
 * Core idempotent session abandonment logic.
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
  supabase: SupabaseClient,
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result<{ status: "completed" | "skipped" }>> {
  // Check if any working sets were logged
  const { data: exercises, error: readError } = await supabase
    .from("session_exercises")
    .select("session_sets(id, is_warmup_set)")
    .eq("session_id", sessionId);

  if (readError) return { ok: false, error: readError.message };

  const status = decideAbandonStatus(exercises ?? []);

  // Clamp duration to sane range: 0 to 6 hours
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(elapsedSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
  // The client's elapsed time is cumulative (wall clock from started_at).
  const { error } = await supabase
    .from("sessions")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      duration_seconds: clampedDuration,
    })
    .eq("id", sessionId)
    .eq("status", "in_progress"); // Only abandon once

  if (error) return { ok: false, error: error.message };

  // Update exercise statuses based on logged vs planned sets
  type ExerciseForStatusUpdate = {
    id: string;
    planned_sets: number;
    status: string;
    session_sets: { id: string; is_warmup_set: boolean }[] | null;
  };

  const { data: exercisesForStatus, error: exerciseReadError } = await supabase
    .from("session_exercises")
    .select("id, planned_sets, status, session_sets(id, is_warmup_set)")
    .eq("session_id", sessionId);

  if (exerciseReadError) {
    return { ok: false, error: exerciseReadError.message };
  }

  // Update each exercise status if still pending
  for (const ex of (exercisesForStatus ?? []) as ExerciseForStatusUpdate[]) {
    if (ex.status !== "pending") continue;

    const workingSets = (ex.session_sets ?? []).filter((s) => !s.is_warmup_set).length;
    const completionStatus = exerciseCompletion(workingSets, ex.planned_sets);
    
    // Map completion status to database enum: "partial" counts as "completed"
    const dbStatus = completionStatus === "skipped" ? "skipped" : "completed";

    await supabase
      .from("session_exercises")
      .update({ status: dbStatus, completed_at: new Date().toISOString() })
      .eq("id", ex.id)
      .eq("status", "pending");
  }

  return { ok: true, data: { status } };
}
