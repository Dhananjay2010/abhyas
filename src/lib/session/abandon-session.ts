import type { Database } from "@/lib/database.types";

type SessionStatus = Database["public"]["Enums"]["session_status"];

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
): Promise<Result> {
  // Check if any working sets were logged
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("session_sets(id, is_warmup_set)")
    .eq("session_id", sessionId);

  const status = decideAbandonStatus(exercises ?? []);

  // Safety: Only update if status is 'in_progress' to prevent double-accumulation on retry.
  // The client's elapsed time is cumulative (wall clock from started_at).
  const { error } = await supabase
    .from("sessions")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      duration_seconds: Math.round(elapsedSeconds),
    })
    .eq("id", sessionId)
    .eq("status", "in_progress"); // Only abandon once

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
