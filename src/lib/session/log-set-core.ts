import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type LogSetInput = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  userId: string;
};

export type LogSetResult =
  | { ok: true }
  | { ok: false; error: string; postgresCode?: string };

/**
 * Core set logging logic: upsert to session_sets.
 * Extracted for testability - can be tested with a typed fake client.
 * 
 * Idempotency: upsert with onConflict on (session_exercise_id, set_number, is_warmup_set).
 * A replayed set (same exercise+setNumber) overwrites with new data, doesn't duplicate.
 * 
 * Postgres unique constraint violation (23505) on the conflict keys means another
 * process already wrote this exact set. We treat that as success (idempotent).
 */
export async function logSetCore(
  client: SupabaseClient<Database>,
  input: LogSetInput,
): Promise<LogSetResult> {
  const { error } = await client.from("session_sets").upsert(
    {
      session_exercise_id: input.sessionExerciseId,
      user_id: input.userId,
      set_number: input.setNumber,
      reps: input.reps,
      weight_kg: input.weightKg,
      duration_seconds: input.durationSeconds,
      is_warmup_set: false,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "session_exercise_id,set_number,is_warmup_set" },
  );

  if (error) {
    // 23505 = unique_violation: another process already wrote this set
    // Treat as success (idempotent replay)
    if (error.code === "23505") {
      return { ok: true };
    }
    
    return {
      ok: false,
      error: error.message,
      postgresCode: error.code,
    };
  }

  return { ok: true };
}
