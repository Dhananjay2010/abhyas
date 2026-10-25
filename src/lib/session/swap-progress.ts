/**
 * Swap progress query and filtering for #127 target resolution.
 * Extracted from actions.ts to make the query testable and avoid dead code.
 */

type ProgressRow = {
  current_target_reps: number | null;
  current_working_weight_kg: number | null;
} | null;

/**
 * Structural client interface for swap progress query.
 * Covers only the chain needed: from/select/eq/eq/maybeSingle.
 * Used for testing with fake clients.
 */
export type SwapProgressClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: ProgressRow }>;
        };
      };
    };
  };
};

/**
 * Build the exercise_progress query for a swapped exercise.
 * Returns the query promise (not awaited).
 * 
 * Exported for testing the query structure (user_id filter, etc.).
 * 
 * @param client - Supabase client (real) or SwapProgressClient (test fake)
 */
export function swapProgressQuery(
  client: SwapProgressClient | { from: (table: string) => unknown },
  userId: string,
  exerciseId: string,
) {
  const typed = client as SwapProgressClient;
  return typed
    .from("exercise_progress")
    .select("current_target_reps, current_working_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
}

/**
 * Filter progress based on planning_mode.
 * Returns null for daily_menu mode (doesn't remember weights/targets).
 * 
 * Exported for testing the planning_mode filter.
 */
export function progressForPlanningMode(
  planningMode: string | null | undefined,
  row: ProgressRow,
): ProgressRow {
  const remembersWeights = planningMode !== "daily_menu";
  return remembersWeights ? row : null;
}
