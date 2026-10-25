/**
 * Build exercise progress query with user_id filter.
 * 
 * Extracted from session/[id]/page.tsx to ensure the .eq('user_id') security filter
 * is always applied when querying exercise_progress.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Narrow structural type for progress query construction.
 * The real SupabaseClient<Database> is assignable to this.
 */
export type ProgressQueryClient = {
  from(table: "exercise_progress"): {
    select(columns: "exercise_id, current_working_weight_kg, current_target_reps"): {
      eq(column: "user_id", value: string): unknown;
    };
  };
};

export function buildExerciseProgressQuery(
  supabase: ProgressQueryClient,
  userId: string
) {
  return supabase
    .from("exercise_progress")
    .select("exercise_id, current_working_weight_kg, current_target_reps")
    .eq("user_id", userId);
}
