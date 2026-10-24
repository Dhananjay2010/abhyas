import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SessionsUpdate = Database["public"]["Tables"]["sessions"]["Update"];

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
  markSessionDone: (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number | null) => Promise<boolean>;
  markPlannedSkipped: (id: string) => Promise<void>;
};

export type CloseStaleQueries = {
  selectSessionSets(ids: string[]): PromiseLike<{ data: SessionExerciseRow[] | null; error: Error | null }>;
  updateSessionIfStatus(
    id: string,
    guardStatus: "in_progress" | "planned",
    values: SessionsUpdate
  ): PromiseLike<{ error: Error | null; count: number | null }>;
};

export function supabaseCloseStaleQueries(supabase: SupabaseClient<Database>): CloseStaleQueries {
  return {
    selectSessionSets: (ids) =>
      supabase
        .from("session_exercises")
        .select("session_id, session_sets(id, is_warmup_set, completed_at)")
        .in("session_id", ids),
    updateSessionIfStatus: (id, guardStatus, values) =>
      supabase.from("sessions").update(values, { count: "exact" }).eq("id", id).eq("status", guardStatus),
  };
}

export function buildCloseStaleDeps(queries: CloseStaleQueries): CloseStaleDeps {
  return {
    fetchSessionExercises: async (sessionIds: string[]) => {
      const { data, error } = await queries.selectSessionSets(sessionIds);
      
      if (error) throw error;
      return data ?? [];
    },
    markSessionDone: async (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number | null) => {
      const guardStatus = "in_progress";
      const values: SessionsUpdate = { 
        status, 
        completed_at: completedAt, 
        duration_seconds: durationSeconds 
      };
      const { error, count } = await queries.updateSessionIfStatus(id, guardStatus, values);
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    markPlannedSkipped: async (id: string) => {
      const guardStatus = "planned";
      const values: SessionsUpdate = { status: "skipped" };
      const { error } = await queries.updateSessionIfStatus(id, guardStatus, values);
      
      if (error) throw error;
    },
  };
}
