export type SessionExerciseRow = {
  session_id: string;
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  }> | null;
};

type UpdateOptions = { count?: "exact" | "estimated" | "planned" };
type UpdateResult = { error: null; count: number | null } | { error: Error; count: null };
type SelectResult<T> = { data: T[] | null; error: null } | { data: null; error: Error };

export type CloseStaleClient = {
  from(table: "sessions"): {
    update(data: Record<string, unknown>, options?: UpdateOptions): {
      eq(column: string, value: string): {
        eq(column: string, value: string): UpdateResult;
      };
    };
  };
  from(table: "session_exercises"): {
    select(columns: string): {
      in(column: string, values: string[]): SelectResult<SessionExerciseRow>;
    };
  };
};

export type CloseStaleDeps = {
  fetchSessionExercises: (sessionIds: string[]) => Promise<SessionExerciseRow[]>;
  markSessionDone: (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => Promise<boolean>;
  markPlannedSkipped: (id: string) => Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCloseStaleDeps(supabase: any): CloseStaleDeps {
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
      const { error, count } = await supabase
        .from("sessions")
        .update({ status, completed_at: completedAt, duration_seconds: durationSeconds }, { count: "exact" })
        .eq("id", id)
        .eq("status", "in_progress");
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    markPlannedSkipped: async (id: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "skipped" })
        .eq("id", id)
        .eq("status", "planned");
      
      if (error) throw error;
    },
  };
}
