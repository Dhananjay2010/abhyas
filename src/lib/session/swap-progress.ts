/**
 * Swap progress filtering for #127 target resolution.
 */

type ProgressRow = {
  current_target_reps: number | null;
  current_working_weight_kg: number | null;
} | null;

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
