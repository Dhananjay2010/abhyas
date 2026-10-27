import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ProgressionFeedback } from "./finish-exercise";

type Client = SupabaseClient<Database>;
type SetFeel = Database["public"]["Enums"]["set_feel"];

export type FinishExerciseDeps = {
  updateExercise(
    id: string,
    patch: { status: Database["public"]["Enums"]["exercise_status"]; feel: SetFeel | null; completed_at: string }
  ): Promise<{ data: { id: string } | null; error: string | null }>;
  applyProgression(
    userId: string,
    sessionExerciseId: string,
    feel: SetFeel | null,
  ): Promise<ProgressionFeedback | null>;
};

export function makeFinishExerciseDeps(
  supabase: Client,
  applyProgressionFn: (
    supabase: Client,
    userId: string,
    sessionExerciseId: string,
    feel: SetFeel | null,
  ) => Promise<ProgressionFeedback | null>,
): FinishExerciseDeps {
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
    async applyProgression(userId, sessionExerciseId, feel) {
      return applyProgressionFn(supabase, userId, sessionExerciseId, feel);
    },
  };
}
