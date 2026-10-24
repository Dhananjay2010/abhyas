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
  markSessionDone: (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => Promise<boolean>;
  markPlannedSkipped: (id: string) => Promise<void>;
};

export interface CloseStaleClient {
  from(table: string): {
    select?(columns: string): {
      in(column: string, values: string[]): PromiseLike<{
        data: SessionExerciseRow[] | null;
        error: Error | null;
      }>;
    };
    update?(data: Record<string, unknown>, options?: { count?: "exact" | "estimated" | "planned" }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): PromiseLike<{
          error: Error | null;
          count: number | null;
        }>;
      };
    };
  };
}

export function buildCloseStaleDeps(supabase: Pick<CloseStaleClient, 'from'>): CloseStaleDeps {
  return {
    fetchSessionExercises: async (sessionIds: string[]) => {
      const builder = supabase.from("session_exercises");
      if (!builder.select) throw new Error("select not available");
      const { data, error } = await builder.select("session_id, session_sets(id, is_warmup_set, completed_at)")
        .in("session_id", sessionIds);
      
      if (error) throw error;
      return data ?? [];
    },
    markSessionDone: async (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => {
      const builder = supabase.from("sessions");
      if (!builder.update) throw new Error("update not available");
      const { error, count } = await builder.update({ status, completed_at: completedAt, duration_seconds: durationSeconds }, { count: "exact" })
        .eq("id", id)
        .eq("status", "in_progress");
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    markPlannedSkipped: async (id: string) => {
      const builder = supabase.from("sessions");
      if (!builder.update) throw new Error("update not available");
      const { error } = await builder.update({ status: "skipped" })
        .eq("id", id)
        .eq("status", "planned");
      
      if (error) throw error;
    },
  };
}
