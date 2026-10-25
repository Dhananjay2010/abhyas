/**
 * Swap prefill: resolve the weight prefill for a swapped-in exercise.
 * 
 * Uses the same suggestedWeight logic as the session page when progress exists,
 * falls back to last performance when it doesn't, and returns null when the
 * exercise has never been trained.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { suggestedWeight } from "@/lib/program/progression";
import { getLastPerformance } from "@/lib/exercise-history";

type TypedSupabase = SupabaseClient<Database>;

/**
 * Resolve the weight prefill for a swapped-in exercise.
 * 
 * Priority:
 * 1. If exercise_progress exists: use suggestedWeight (respects deload)
 * 2. Else if last performance exists: use top set weight (with deload reduction)
 * 3. Else: null
 * 
 * Best-effort: returns null on any error to ensure the swap still succeeds.
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param exerciseId - The swapped-in exercise ID
 * @param isDeload - Whether this is a deload session
 * @param equipmentIds - Equipment IDs for the exercise (for bodyweight detection)
 * @param metric - Exercise metric
 * @param movementPattern - Movement pattern (for suggestedWeight)
 * @param progressValue - Optional pre-fetched progress value (removes duplicate query)
 * @param remembersWeights - Whether to use remembered weights (false in daily_menu mode)
 * @returns Weight prefill in kg, or null
 */
export async function resolveSwapPrefill(
  supabase: TypedSupabase,
  userId: string,
  exerciseId: string,
  isDeload: boolean,
  equipmentIds: string[],
  metric: Database["public"]["Enums"]["exercise_metric"],
  movementPattern: Database["public"]["Enums"]["movement_pattern"],
  progressValue: number | null | undefined,
  remembersWeights: boolean,
): Promise<number | null> {
  try {
    // When remembersWeights is false (daily_menu mode), skip progress/history entirely
    // (same rule as the session page)
    if (!remembersWeights) {
      return null;
    }

    // Use pre-fetched progress if provided (removes duplicate query from resolveSwapWeights)
    let currentWorkingWeight: number | null = null;
    if (progressValue !== undefined) {
      currentWorkingWeight = progressValue;
    } else {
      // Fallback: fetch progress (for legacy callers or direct usage)
      const { data: progress } = await supabase
        .from("exercise_progress")
        .select("current_working_weight_kg")
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .maybeSingle();
      currentWorkingWeight = progress?.current_working_weight_kg ?? null;
    }


    if (currentWorkingWeight !== null && currentWorkingWeight !== undefined) {
      const working = Number(currentWorkingWeight);
      if (working > 0) {
        // Use the same suggestedWeight logic as session/[id]/page.tsx:141
        const isBodyweight = equipmentIds.length === 0;
        // TODO: MEDIUM-3 - Pass equipmentIds and unit for grid snapping once #120 lands
        // For now, pass undefined to use the existing simple deload calculation
        return suggestedWeight(
          { currentWorkingWeightKg: working },
          isDeload,
          {
            mechanic: null,
            movementPattern,
            metric,
            isBodyweight,
            progressionChain: null,
            progressionRank: null,
          },
          undefined,
          undefined,
        );
      }
    }

    // Fall back to last performance
    const lastPerf = await getLastPerformance(supabase, userId, exerciseId);
    if (lastPerf?.topSet?.weight_kg !== undefined && lastPerf.topSet.weight_kg !== null) {
      const weight = lastPerf.topSet.weight_kg;
      
      // L2: Return null for bodyweight (0 weight) or truly zero weight
      if (weight <= 0) return null;
      
      // L1: Apply deload reduction to history fallback too
      const isBodyweight = equipmentIds.length === 0;
      // TODO: MEDIUM-3 - Pass equipmentIds and unit for grid snapping once #120 lands
      return suggestedWeight(
        { currentWorkingWeightKg: weight },
        isDeload,
        {
          mechanic: null,
          movementPattern,
          metric,
          isBodyweight,
          progressionChain: null,
          progressionRank: null,
        },
        undefined,
        undefined,
      );
    }

    return null;
  } catch (error) {
    // MEDIUM-2: Best-effort - log the error but return null so swap succeeds
    console.error("[resolveSwapPrefill] Failed to resolve weight prefill:", error);
    return null;
  }
}
