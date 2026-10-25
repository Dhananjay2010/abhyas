/**
 * Swap progress filtering for #127 target resolution.
 */

type ProgressRow = {
  current_target_reps: number | null;
  current_working_weight_kg: number | null;
} | null;

/**
 * Check if a planning mode remembers weights/targets.
 * Daily menu mode doesn't remember weights/targets.
 */
export function remembersWeightsFor(
  planningMode: string | null | undefined,
): boolean {
  return planningMode !== "daily_menu";
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
  return remembersWeightsFor(planningMode) ? row : null;
}
