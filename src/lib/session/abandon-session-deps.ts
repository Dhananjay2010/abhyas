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
  planned_sets: number | null;
  status: Database["public"]["Enums"]["exercise_status"];
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
  }> | null;
};

export type AbandonSessionDeps = {
  loadExercises(sessionId: string): Promise<{ data: SessionExerciseRow[] | null; error: string | null }>;
  updateSession(id: string, patch: { status: Database["public"]["Enums"]["session_status"]; completed_at: string | null; duration_seconds: number | null }): Promise<{ error: string | null; updatedCount: number }>;
  loadSessionStatus(id: string): Promise<{ data: { status: "completed" | "skipped" | "in_progress" } | null; error: string | null }>;
  loadExercisesForUpdate(sessionId: string): Promise<{ data: ExerciseForUpdate[] | null; error: string | null }>;
  updateExerciseStatus(id: string, status: Database["public"]["Enums"]["exercise_status"]): Promise<{ error: string | null }>;
  loadSessionMetadata(id: string): Promise<{ data: { started_at: string | null } | null; error: string | null }>;
  loadExercisesWithSets(sessionId: string): Promise<{ data: Array<{ rest_seconds: number | null; session_sets: Array<{ completed_at: string; is_warmup_set: boolean }> | null }> | null; error: string | null }>;
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
      const { error, count } = await supabase
        .from("sessions")
        .update(patch, { count: "exact" })
        .eq("id", id)
        .eq("status", "in_progress");

      return {
        error: error ? error.message : null,
        updatedCount: count ?? 0,
      };
    },

    async loadSessionStatus(id) {
      const { data, error } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", id)
        .maybeSingle();

      if (error) return { data: null, error: error.message };
      if (!data) return { data: null, error: null };

      const status = data.status;
      if (status !== "completed" && status !== "skipped" && status !== "in_progress") {
        return { data: null, error: `Unexpected status: ${status}` };
      }

      return { data: { status }, error: null };
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

    async loadSessionMetadata(id) {
      const { data, error } = await supabase
        .from("sessions")
        .select("started_at")
        .eq("id", id)
        .maybeSingle();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    },

    async loadExercisesWithSets(sessionId) {
      const { data, error } = await supabase
        .from("session_exercises")
        .select("rest_seconds, session_sets(completed_at, is_warmup_set)")
        .eq("session_id", sessionId);

      if (error) return { data: null, error: error.message };

      const exercises = (data ?? []).map((ex) => ({
        rest_seconds: ex.rest_seconds,
        session_sets: (ex.session_sets ?? []).map((s) => ({
          completed_at: s.completed_at,
          is_warmup_set: s.is_warmup_set,
        })),
      }));

      return { data: exercises, error: null };
    },
  };
}
