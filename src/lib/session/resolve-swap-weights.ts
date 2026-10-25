/**
 * Resolve weight prefill and working weight for a swapped exercise.
 * 
 * Extracted from swapExercise action for testing (MEDIUM-1).
 * Returns prefill (about 70% in deload), working weight, and bodyweight flag.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveSwapPrefill } from "@/lib/session/swap-prefill";

export type SwapWeightsResult = {
  weightPrefill: number | null;
  workingWeightKg: number | null;
  isBodyweight: boolean;
};

/**
 * Resolve the weight prefill and working weight for a swapped-in exercise.
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param sessionId - Session ID (to read is_deload)
 * @param newExerciseId - The exercise being swapped IN
 * @param equipmentIds - Equipment IDs of the new exercise
 * @param metric - Metric of the new exercise
 * @param movementPattern - Movement pattern of the new exercise
 * @returns Weight prefill, working weight, and bodyweight flag
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
        .select("current_working_weight_kg")
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

    // On progress error, working weight is null (no header line)
    const workingWeightKg = progressRes.error
      ? null
      : Number(progressRes.data?.current_working_weight_kg ?? null);

    const isBodyweight = equipmentIds.length === 0;

    return { weightPrefill, workingWeightKg, isBodyweight };
  } catch (error) {
    // Best-effort: on any unexpected error, return nulls
    console.error("Failed to resolve swap weights:", error);
    return { weightPrefill: null, workingWeightKg: null, isBodyweight: equipmentIds.length === 0 };
  }
}
