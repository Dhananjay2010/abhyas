import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionRow = {
  id: string;
  started_at: string | null;
};

export type ExerciseWithSets = {
  session_id: string;
  rest_seconds: number | null;
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  }> | null;
};

export type CloseStaleSessionsDeps = {
  loadSessions(ids: string[]): Promise<SessionRow[]>;
  loadExercisesWithSets(sessionIds: string[]): Promise<ExerciseWithSets[]>;
  updateSession(id: string, patch: { status: Database["public"]["Enums"]["session_status"]; completed_at: string | null; duration_seconds: number }): Promise<{ error: string | null }>;
};

export function makeCloseStaleSessionsDeps(supabase: Client): CloseStaleSessionsDeps {
  return {
    async loadSessions(ids) {
      const { data } = await supabase
        .from("sessions")
        .select("id, started_at")
        .in("id", ids);

      return (data ?? []).map((s) => ({
        id: s.id,
        started_at: s.started_at,
      }));
    },

    async loadExercisesWithSets(sessionIds) {
      const { data } = await supabase
        .from("session_exercises")
        .select("session_id, rest_seconds, session_sets(id, is_warmup_set, completed_at)")
        .in("session_id", sessionIds);

      return (data ?? []).map((ex) => ({
        session_id: ex.session_id,
        rest_seconds: ex.rest_seconds,
        session_sets: (ex.session_sets ?? []).map((s) => ({
          id: s.id,
          is_warmup_set: s.is_warmup_set,
          completed_at: s.completed_at,
        })),
      }));
    },

    async updateSession(id, patch) {
      const { error } = await supabase
        .from("sessions")
        .update(patch)
        .eq("id", id);

      return { error: error ? error.message : null };
    },
  };
}
