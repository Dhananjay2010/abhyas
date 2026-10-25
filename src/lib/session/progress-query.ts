/**
 * Build exercise progress query with user_id filter.
 * 
 * Extracted from session/[id]/page.tsx to ensure the .eq('user_id') security filter
 * is always applied when querying exercise_progress.
 */

export function buildExerciseProgressQuery<T>(
  supabase: {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): T;
      };
    };
  },
  userId: string
): T {
  return supabase
    .from("exercise_progress")
    .select("exercise_id, current_working_weight_kg, current_target_reps")
    .eq("user_id", userId);
}
