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
 * 2. Else if last performance exists: use top set weight
 * 3. Else: null
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param exerciseId - The swapped-in exercise ID
 * @param isDeload - Whether this is a deload session
 * @param equipmentIds - Equipment IDs for the exercise (for bodyweight detection)
 * @param metric - Exercise metric
 * @param movementPattern - Movement pattern (for suggestedWeight)
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
): Promise<number | null> {
  // Check for exercise progress (the primary source)
  const { data: progress } = await supabase
    .from("exercise_progress")
    .select("current_working_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  if (progress?.current_working_weight_kg !== null && progress?.current_working_weight_kg !== undefined) {
    const working = Number(progress.current_working_weight_kg);
    if (working > 0) {
      // Use the same suggestedWeight logic as session/[id]/page.tsx:141
      const isBodyweight = equipmentIds.length === 0;
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
      );
    }
  }

  // Fall back to last performance
  const lastPerf = await getLastPerformance(supabase, userId, exerciseId);
  if (lastPerf?.topSet?.weight_kg !== undefined && lastPerf.topSet.weight_kg !== null) {
    return lastPerf.topSet.weight_kg;
  }

  return null;
}
