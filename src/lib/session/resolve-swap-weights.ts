/**
 * Resolve weight prefill, working weight, and target reps for a swapped exercise.
 * 
 * Extracted from swapExercise action for testing (MEDIUM-1).
 * Returns prefill (about 70% in deload), working weight, target reps, and bodyweight flag.
 * 
 * EXTENDS #125: Adds current_target_reps to the progress query for #127's target resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveSwapPrefill } from "@/lib/session/swap-prefill";

export type SwapWeightsResult = {
  weightPrefill: number | null;
  workingWeightKg: number | null;
  currentTargetReps: number | null;
  isBodyweight: boolean;
};

/**
 * Resolve the weight prefill, working weight, and target reps for a swapped-in exercise.
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param sessionId - Session ID (to read is_deload)
 * @param newExerciseId - The exercise being swapped IN
 * @param equipmentIds - Equipment IDs of the new exercise
 * @param metric - Metric of the new exercise
 * @param movementPattern - Movement pattern of the new exercise
 * @returns Weight prefill, working weight, target reps, and bodyweight flag
 */
export async function resolveSwapWeights(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  newExerciseId: string,
  equipmentIds: string[],
  metric: Database["public"]["Enums"]["exercise_metric"],
  movementPattern: Database["public"]["Enums"]["movement_pattern"],
): Promise<SwapWeightsResult> {
  try {
    // Read session's is_deload flag, progress for the NEW exercise (in parallel)
    const [sessionRes, progressRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("is_deload")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("exercise_progress")
        .select("current_working_weight_kg, current_target_reps")
        .eq("user_id", userId)
        .eq("exercise_id", newExerciseId)
        .maybeSingle(),
    ]);

    // On error reading is_deload, treat as unknown (no deload prefill)
    const isDeload = sessionRes.error ? false : (sessionRes.data?.is_deload ?? false);

    // Resolve weight prefill (best-effort, handles own errors)
    const weightPrefill = await resolveSwapPrefill(
      supabase,
      userId,
      newExerciseId,
      isDeload,
      equipmentIds,
      metric,
      movementPattern,
    );

    // On error reading is_deload, log and return null prefill (don't silently use full weight)
    if (sessionRes.error) {
      console.error("[resolveSwapWeights] Failed to read is_deload:", sessionRes.error);
      // Still compute working weight and target reps if progress succeeded
      const v = progressRes.data?.current_working_weight_kg;
      const workingWeightKg = v == null ? null : Number(v);
      const target = progressRes.data?.current_target_reps;
      const currentTargetReps = target == null ? null : Number(target);
      return { weightPrefill: null, workingWeightKg, currentTargetReps, isBodyweight: equipmentIds.length === 0 };
    }

    // On progress error, working weight and target reps are null (no header line)
    const progressValue = progressRes.data?.current_working_weight_kg;
    const workingWeightKg = progressRes.error || progressValue == null ? null : Number(progressValue);
    
    const targetValue = progressRes.data?.current_target_reps;
    const currentTargetReps = progressRes.error || targetValue == null ? null : Number(targetValue);

    const isBodyweight = equipmentIds.length === 0;

    return { weightPrefill, workingWeightKg, currentTargetReps, isBodyweight };
  } catch (error) {
    // Best-effort: on any unexpected error, return nulls
    console.error("Failed to resolve swap weights:", error);
    return { weightPrefill: null, workingWeightKg: null, currentTargetReps: null, isBodyweight: equipmentIds.length === 0 };
  }
}
