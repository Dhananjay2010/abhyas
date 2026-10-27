import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionExerciseRow = {
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
  }> | null;
};

export type AbandonSessionDeps = {
  loadExercises(sessionId: string): Promise<{ data: SessionExerciseRow[] | null; error: string | null }>;
  updateSession(id: string, patch: { status: Database["public"]["Enums"]["session_status"]; completed_at: string | null; duration_seconds: number | null }): Promise<{ error: string | null; updatedCount: number }>;
  loadSessionStatus(id: string): Promise<{ data: { status: "completed" | "skipped" | "in_progress" } | null; error: string | null }>;
  loadSessionMetadata(id: string): Promise<{ data: { started_at: string | null; user_id: string } | null; error: string | null }>;
  loadExercisesWithSets(sessionId: string): Promise<{ data: Array<{ rest_seconds: number | null; session_sets: Array<{ completed_at: string; is_warmup_set: boolean }> | null }> | null; error: string | null }>;
  loadTimezone(userId: string): Promise<{ data: { timezone: string | null } | null; error: string | null }>;
  now?: () => string;
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

    async loadSessionMetadata(id) {
      const { data, error } = await supabase
        .from("sessions")
        .select("started_at, user_id")
        .eq("id", id)
        .maybeSingle();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    },

    async loadTimezone(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
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
