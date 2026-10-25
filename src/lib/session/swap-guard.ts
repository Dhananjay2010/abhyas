/**
 * Guard to prevent swapping an exercise after sets have been logged.
 * 
 * Bug: Opening the swap sheet, logging a set for that exercise, then tapping
 * a swap option would apply the swap and move the logged set to the new exercise.
 * 
 * Fix: Check for ANY logged sets (including warm-ups, though the runner context
 * doesn't allow that) and refuse the swap with a friendly message.
 * 
 * Separated into its own file to keep the diff to actions.ts minimal, since
 * PR #129 is refactoring swapExercise and this avoids merge conflicts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SupabaseClientType = SupabaseClient<Database>;

export type SwapGuardDeps = {
  query: (
    sessionExerciseId: string,
  ) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
};

export type SwapGuardResult =
  | { allowed: true }
  | { allowed: false; error: string };

/**
 * Check if a session_exercise has any logged sets.
 * 
 * @param deps - Dependency injection for the query
 * @param sessionExerciseId - The session_exercise to check
 * @returns allowed: true if no sets exist, or allowed: false with an error message
 */
export async function canSwapExercise(
  deps: SwapGuardDeps,
  sessionExerciseId: string,
): Promise<SwapGuardResult> {
  const { data, error } = await deps.query(sessionExerciseId);

  if (error) {
    return { allowed: false, error: error.message };
  }

  if (data && data.length > 0) {
    return {
      allowed: false,
      error: "You've already logged a set for this exercise, so it can't be swapped.",
    };
  }

  return { allowed: true };
}

/**
 * Create the Supabase query dependency for the guard.
 * 
 * RLS applies, so only sets owned by the current user are checked.
 * We check for ANY set (is_warmup_set true or false) though in the runner
 * context warm-ups are never mixed with working sets for the same exercise.
 */
export function createSupabaseSwapGuardDeps(
  supabase: SupabaseClientType,
): SwapGuardDeps {
  return {
    query: async (sessionExerciseId: string) => {
      return await supabase
        .from("session_sets")
        .select("id")
        .eq("session_exercise_id", sessionExerciseId)
        .limit(1);
    },
  };
}
