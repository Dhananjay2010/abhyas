import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type SetFeel = Database["public"]["Enums"]["set_feel"];

export type FinishExerciseDeps = {
  updateExercise(
    id: string,
    patch: { status: string; feel: SetFeel | null; completed_at: string }
  ): Promise<{ data: { id: string } | null; error: string | null }>;
};

export function makeFinishExerciseDeps(supabase: Client): FinishExerciseDeps {
  return {
    async updateExercise(id, patch) {
      const { data, error } = await supabase
        .from("session_exercises")
        .update(patch)
        .eq("id", id)
        .not("status", "in", "(completed,skipped)")
        .select("id")
        .maybeSingle();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    },
  };
}
