import type { Database } from "@/lib/database.types";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

/**
 * Constants for target capping.
 * - MAX_HOLD_SECONDS: #120's ceiling for timed holds
 * - Reps: capped at 2 × planMax per coordinator rule
 */
export const MAX_HOLD_SECONDS = 120;

/**
 * Determine whether the displayed target should use the stored progression target.
 * 
 * **Rule (coordinator final):** UNLOADED exercises (bodyweight, with no added working
 * weight) use the stored current_target_reps. This covers both reps (push-ups stored
 * at 14 show 14) and timed holds (planks stored at 45s show 45s).
 * 
 * LOADED exercises (including weighted holds) use the plan range.
 * 
 * @param isBodyweight - Whether the exercise has no equipment (bodyweight)
 * @param currentWorkingWeightKg - Current working weight; null means no weight recorded
 * @returns true if the stored target should be used
 */
export function usesStoredTarget(params: {
  isBodyweight: boolean;
  currentWorkingWeightKg: number | null;
}): boolean {
  const { isBodyweight, currentWorkingWeightKg } = params;
  
  // UNLOADED: bodyweight exercise with no added weight
  return isBodyweight && (currentWorkingWeightKg === null || currentWorkingWeightKg === 0);
}

/**
 * Resolve the displayed target for an exercise in the session runner.
 * 
 * For UNLOADED exercises (bodyweight, no added weight): uses stored target if valid.
 * For LOADED exercises: uses the plan range.
 * 
 * **Sanity checks:**
 * - If stored target is null, <= 0, not finite, or below plan min → use plan range
 * - Timed holds capped at 120s (#120's ceiling)
 * - Reps capped at 2 × planMax
 * 
 * @returns { min, max } for the target display
 */
export function resolveTarget(params: {
  metric: ExerciseMetric;
  plannedMin: number;
  plannedMax: number;
  currentTargetReps: number | null | undefined;
  isBodyweight: boolean;
  currentWorkingWeightKg: number | null;
}): { min: number; max: number } {
  const {
    metric,
    plannedMin,
    plannedMax,
    currentTargetReps,
    isBodyweight,
    currentWorkingWeightKg,
  } = params;

  // Check if we should use the stored target
  const useStored = usesStoredTarget({ isBodyweight, currentWorkingWeightKg });
  
  if (!useStored) {
    // LOADED exercise: use plan range
    return { min: plannedMin, max: plannedMax };
  }

  // UNLOADED exercise: try to use stored target
  const stored = currentTargetReps ?? null;
  
  // Sanity checks: null, <= 0, not finite, or below plan min → use plan
  if (
    stored === null ||
    stored <= 0 ||
    !Number.isFinite(stored) ||
    stored < plannedMin
  ) {
    return { min: plannedMin, max: plannedMax };
  }

  // Cap the stored value
  let capped = stored;
  if (metric === "seconds") {
    // Timed holds: cap at 120s (#120's ceiling)
    capped = Math.min(stored, MAX_HOLD_SECONDS);
  } else {
    // Reps: cap at 2 × planMax
    capped = Math.min(stored, 2 * plannedMax);
  }

  return { min: capped, max: capped };
}
