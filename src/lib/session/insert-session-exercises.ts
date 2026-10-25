import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionExerciseInsert = {
  session_id: string;
  user_id: string;
  exercise_id: string;
  order_index: number;
  planned_sets: number;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number;
  metric: "reps" | "time";
};

/**
 * Insert session exercises for a newly created session.
 * 
 * Uses upsert with ignoreDuplicates on (session_id, order_index) to make the
 * operation idempotent. In a two-tab race where both tabs try to start a session,
 * the loser of the `sessions` insert will get a 23505 and startSessionCore will
 * return the winner's session id. Both tabs then try to insert exercises for that
 * session, and whichever commits second would get a duplicate-key error on
 * session_exercises_session_id_order_index_key without the upsert.
 * 
 * With ignoreDuplicates, the second insert is a no-op and returns success, which
 * is the correct behavior: the exercises already exist, inserted by the winning tab.
 */
export async function insertSessionExercises(
  supabase: Client,
  exercises: SessionExerciseInsert[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (exercises.length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("session_exercises")
    .upsert(exercises, {
      onConflict: "session_id,order_index",
      ignoreDuplicates: true,
    });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
