import type { Decision } from "@/lib/program/progression";

/**
 * Minimal Supabase client interface for writing exercise progress.
 */
export interface ProgressClient {
  from: (table: string) => {
    upsert: (
      data: Record<string, unknown>,
      opts: { onConflict: string }
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

export type ProgressWrite = {
  user_id: string;
  exercise_id: string;
  current_working_weight_kg: number | null;
  current_target_reps: number | null;
  consecutive_failures: number;
  last_performed_on: string | null;
  best_weight_kg: number | null;
  best_reps: number | null;
  best_e1rm: number | null;
  total_sessions: number;
  updated_at: string;
};

/**
 * Write exercise progression to database.
 *
 * Extracted for testing with injected client. Production code injects the
 * real Supabase client; tests inject a fake that records writes.
 */
export async function writeExerciseProgressCore(
  client: ProgressClient,
  userId: string,
  exerciseId: string,
  decision: Decision,
  priorTotalSessions: number,
  localDate: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const row: ProgressWrite = {
    user_id: userId,
    exercise_id: exerciseId,
    current_working_weight_kg: decision.nextWorkingWeightKg,
    current_target_reps: decision.nextTargetReps,
    consecutive_failures: decision.consecutiveFailures,
    last_performed_on: localDate,
    best_weight_kg: decision.bestWeightKg,
    best_reps: decision.bestReps,
    best_e1rm: decision.bestE1rm,
    total_sessions: priorTotalSessions + 1,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("exercise_progress").upsert(row, {
    onConflict: "user_id,exercise_id",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
