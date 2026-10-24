import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionExerciseRow = {
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
  }> | null;
};

export type ExerciseForUpdate = {
  id: string;
  planned_sets: number;
  status: string;
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
  }> | null;
};

export type AbandonSessionDeps = {
  loadExercises(sessionId: string): Promise<{ data: SessionExerciseRow[] | null; error: string | null }>;
  updateSession(id: string, patch: { status: string; completed_at: string | null; duration_seconds: number }): Promise<{ error: string | null }>;
  loadExercisesForUpdate(sessionId: string): Promise<{ data: ExerciseForUpdate[] | null; error: string | null }>;
  updateExerciseStatus(id: string, status: string): Promise<{ error: string | null }>;
};

export function makeAbandonSessionDeps(supabase: Client): AbandonSessionDeps {
  return {
    async loadExercises(sessionId) {
      const { data, error } = await supabase
        .from("session_exercises")
        .select("session_sets(id, is_warmup_set)")
        .eq("session_id", sessionId);

      if (error) return { data: null, error: error.message };

      const exercises = (data ?? []).map((ex) => ({
        session_sets: (ex.session_sets ?? []).map((s) => ({
          id: s.id,
          is_warmup_set: s.is_warmup_set,
        })),
      }));

      return { data: exercises, error: null };
    },

    async updateSession(id, patch) {
      const { error } = await supabase
        .from("sessions")
        .update(patch)
        .eq("id", id)
        .eq("status", "in_progress");

      return { error: error ? error.message : null };
    },

    async loadExercisesForUpdate(sessionId) {
      const { data, error } = await supabase
        .from("session_exercises")
        .select("id, planned_sets, status, session_sets(id, is_warmup_set)")
        .eq("session_id", sessionId);

      if (error) return { data: null, error: error.message };

      const exercises = (data ?? []).map((ex) => ({
        id: ex.id,
        planned_sets: ex.planned_sets,
        status: ex.status,
        session_sets: (ex.session_sets ?? []).map((s) => ({
          id: s.id,
          is_warmup_set: s.is_warmup_set,
        })),
      }));

      return { data: exercises, error: null };
    },

    async updateExerciseStatus(id, status) {
      const { error } = await supabase
        .from("session_exercises")
        .update({ status })
        .eq("id", id);

      return { error: error ? error.message : null };
    },
  };
}
