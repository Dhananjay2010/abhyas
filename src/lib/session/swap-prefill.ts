/**
 * Swap prefill: resolve the weight prefill for a swapped-in exercise.
 * 
 * This is a stub for #127 to compile. The actual implementation comes from #125.
 * When #125 merges, this file will be replaced entirely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type TypedSupabase = SupabaseClient<Database>;

/**
 * Resolve the weight prefill for a swapped-in exercise.
 * 
 * STUB: Returns null. Real implementation from #125.
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
  // Stub implementation - returns null
  // Real implementation comes from #125
  return null;
}
