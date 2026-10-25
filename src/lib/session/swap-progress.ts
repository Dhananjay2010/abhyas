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

/**
 * Resolve swap result payload from raw progress and planning mode.
 * 
 * For daily_menu: returns null currentTargetReps (uses plan range)
 * For progression: returns stored currentTargetReps
 * 
 * This is the core logic swapExercise uses to determine what to return.
 */
export function resolveSwapResultPayload(input: {
  planningMode: string | null | undefined;
  rawCurrentTargetReps: number | null;
  rawWorkingWeightKg: number | null;
  planRepsMin: number | null;
  planRepsMax: number | null;
}): {
  currentTargetReps: number | null;
  workingWeightKg: number | null;
  repsMin: number | null;
  repsMax: number | null;
} {
  const filteredProgress = progressForPlanningMode(input.planningMode, {
    current_target_reps: input.rawCurrentTargetReps,
    current_working_weight_kg: input.rawWorkingWeightKg,
  });

  return {
    currentTargetReps: filteredProgress?.current_target_reps ?? null,
    workingWeightKg: filteredProgress?.current_working_weight_kg ?? null,
    repsMin: input.planRepsMin,
    repsMax: input.planRepsMax,
  };
}
