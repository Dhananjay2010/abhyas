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
  from(table: string): unknown;
}

export function buildCloseStaleDeps(supabase: CloseStaleClient): CloseStaleDeps {
  return {
    fetchSessionExercises: async (sessionIds: string[]) => {
      const builder = supabase.from("session_exercises") as {
        select: (columns: string) => {
          in: (column: string, values: string[]) => Promise<{
            data: SessionExerciseRow[] | null;
            error: Error | null;
          }>;
        };
      };
      const { data, error } = await builder
        .select("session_id, session_sets(id, is_warmup_set, completed_at)")
        .in("session_id", sessionIds);
      
      if (error) throw error;
      return data ?? [];
    },
    markSessionDone: async (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number) => {
      const builder = supabase.from("sessions") as {
        update: (data: Record<string, unknown>, options?: { count?: "exact" | "estimated" | "planned" }) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => Promise<{
              error: Error | null;
              count: number | null;
            }>;
          };
        };
      };
      const { error, count } = await builder
        .update({ status, completed_at: completedAt, duration_seconds: durationSeconds }, { count: "exact" })
        .eq("id", id)
        .eq("status", "in_progress");
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    markPlannedSkipped: async (id: string) => {
      const builder = supabase.from("sessions") as {
        update: (data: Record<string, unknown>) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => Promise<{
              error: Error | null;
            }>;
          };
        };
      };
      const { error } = await builder
        .update({ status: "skipped" })
        .eq("id", id)
        .eq("status", "planned");
      
      if (error) throw error;
    },
  };
}
