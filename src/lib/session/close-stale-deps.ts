import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionExerciseRow = {
  session_id: string;
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  }> | null;
};

export type CloseStaleDeps = {
  fetchSessionExercises: (sessionIds: string[]) => Promise<SessionExerciseRow[]>;
  markSessionDone: (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => Promise<void>;
};

export function buildCloseStaleDeps(supabase: Client): CloseStaleDeps {
  return {
    fetchSessionExercises: async (sessionIds: string[]) => {
      const { data, error } = await supabase
        .from("session_exercises")
        .select("session_id, session_sets(id, is_warmup_set, completed_at)")
        .in("session_id", sessionIds);
      
      if (error) throw error;
      return data ?? [];
    },
    markSessionDone: async (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => {
      const { error } = await supabase
        .from("sessions")
        .update({ status, completed_at: completedAt, duration_seconds: durationSeconds })
        .eq("id", id)
        .eq("status", "in_progress");
      
      if (error) throw error;
    },
  };
}
