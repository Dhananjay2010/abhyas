import { decideAbandonStatus } from "./abandon-session";

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// Minimal Supabase client interface
export interface SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

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
 */
export async function finishSessionCore(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    durationSeconds: number;
    cooldownCompleted: boolean;
  },
): Promise<Result<{ status: "completed" | "skipped" }>> {
  // Check if any working sets were logged
  const { data: exercises, error: readError } = await supabase
    .from("session_exercises")
    .select("session_sets(id, is_warmup_set)")
    .eq("session_id", params.sessionId);

  if (readError) return { ok: false, error: readError.message };

  // Determine if this should be completed or skipped based on working sets
  const status = decideAbandonStatus(exercises ?? []);

  // Clamp duration to sane range: 0 to 6 hours
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(params.durationSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-application on retry.
  const { error } = await supabase
    .from("sessions")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      duration_seconds: clampedDuration,
      cooldown_completed: status === "completed" ? params.cooldownCompleted : undefined,
    })
    .eq("id", params.sessionId)
    .eq("status", "in_progress"); // Only finish once

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { status } };
}
