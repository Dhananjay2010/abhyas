import type { Database } from "@/lib/database.types";
import { LOADABLE_EQUIPMENT_IDS } from "@/lib/session/equipment-grid";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

/**
 * Constants for target capping.
 * - MAX_HOLD_SECONDS: #120's ceiling for timed holds
 * - Reps: capped at 2 × planMax per coordinator rule
 */
export const MAX_HOLD_SECONDS = 120;

/**
 * Determine whether an exercise is unloaded.
 * 
 * An exercise is unloaded if it uses no LOADABLE_EQUIPMENT_IDS
 * AND has no recorded working weight (null or 0 kg).
 * 
 * This includes:
 * - Pure bodyweight exercises (push-ups, planks, squats)
 * - Pull-ups, chin-ups (hanging from bar with no added weight)
 * - Dips (on bars/rings with no added weight)
 * - Hanging raises (no added weight)
 * 
 * NOT unloaded:
 * - Weighted pull-ups (dip belt with plates)
 * - Weighted dips
 * - Barbell/dumbbell exercises
 * - Machine exercises
 * 
 * @param equipmentIds - Array of equipment IDs for the exercise
 * @param currentWorkingWeightKg - Current working weight; null means no weight recorded
 * @returns true if the exercise is unloaded
 */
export function isUnloaded(params: {
  equipmentIds: readonly string[];
  currentWorkingWeightKg: number | null;
}): boolean {
  const { equipmentIds, currentWorkingWeightKg } = params;
  
  // Check if any equipment is loadable
  const hasLoadableEquipment = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
  
  // Unloaded: no loadable equipment AND (no weight recorded OR zero weight)
  return !hasLoadableEquipment && (currentWorkingWeightKg === null || currentWorkingWeightKg === 0);
}

/**
 * Determine whether the displayed target should use the stored progression target.
 * 
 * **Rule (coordinator final):** UNLOADED exercises use the stored current_target_reps.
 * This covers both reps (push-ups stored at 14 show 14) and timed holds (planks stored
 * at 45s show 45s).
 * 
 * LOADED exercises use the plan range.
 * 
 * @param equipmentIds - Array of equipment IDs for the exercise
 * @param currentWorkingWeightKg - Current working weight; null means no weight recorded
 * @returns true if the stored target should be used
 */
export function usesStoredTarget(params: {
  equipmentIds: readonly string[];
  currentWorkingWeightKg: number | null;
}): boolean {
  return isUnloaded(params);
}

/**
 * Resolve the displayed target for an exercise in the session runner.
 * 
 * For UNLOADED exercises: uses stored target if valid.
 * For LOADED exercises: uses the plan range.
 * 
 * **Sanity checks:**
 * - If stored target is null, <= 0, not finite, or below plan min → use plan range
 * - Timed holds capped at 120s (#120's ceiling)
 * - Reps capped at 2 × planMax
 * - String values are converted with Number(); non-finite → use plan range
 * 
 * @returns { min, max } for the target display
 */
export function resolveTarget(params: {
  metric: ExerciseMetric;
  plannedMin: number;
  plannedMax: number;
  currentTargetReps: number | string | null | undefined;
  equipmentIds: readonly string[];
  currentWorkingWeightKg: number | null;
}): { min: number; max: number } {
  const {
    metric,
    plannedMin,
    plannedMax,
    currentTargetReps,
    equipmentIds,
    currentWorkingWeightKg,
  } = params;

  // Check if we should use the stored target
  const useStored = usesStoredTarget({ equipmentIds, currentWorkingWeightKg });
  
  if (!useStored) {
    // LOADED exercise: use plan range
    return { min: plannedMin, max: plannedMax };
  }

  // UNLOADED exercise: try to use stored target
  // Handle string values (convert with Number())
  const rawStored = currentTargetReps ?? null;
  const stored = typeof rawStored === 'string' ? Number(rawStored) : rawStored;
  
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
