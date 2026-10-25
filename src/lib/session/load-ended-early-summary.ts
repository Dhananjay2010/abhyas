/**
 * Load ended-early summary for a completed session.
 * 
 * Queries session_exercises + session_sets and returns whether the session
 * ended early along with working/planned set counts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { countWorkingSets, type SetForCounting } from "@/lib/session/count-sets";
import { isEndedEarly } from "@/lib/session/ended-early";

export type EndedEarlySummary = {
  endedEarly: boolean;
  workingSets: number;
  plannedSets: number;
};

type SessionExerciseRow = {
  id: string;
  status: string | null;
  planned_sets: number | null;
  session_sets: Array<SetForCounting>;
};

/**
 * Pure function to summarize ended-early status from session exercise rows.
 * 
 * - Only 'pending' and 'completed' exercises count toward planned sets
 * - 'skipped' and 'swapped_out' are excluded
 * - Warmup sets are not counted as working sets
 * 
 * @param exercises Array of session_exercises with their sets
 * @returns Summary with endedEarly flag and set counts
 */
export function summarizeEndedEarly(exercises: SessionExerciseRow[]): EndedEarlySummary {
  let hasPendingExercise = false;
  let hasNoExercises = exercises.length === 0;
  let totalPlannedSets = 0;
  let completedSetCount = 0;
  
  for (const ex of exercises) {
    if (ex.status === "pending") {
      hasPendingExercise = true;
    }
    // Only sum planned_sets from pending or completed exercises (exclude skipped/swapped_out)
    if (ex.status === "pending" || ex.status === "completed") {
      totalPlannedSets += ex.planned_sets ?? 0;
    }
    completedSetCount += countWorkingSets(ex.session_sets);
  }
  
  const endedEarly = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise,
    plannedSets: totalPlannedSets,
    workingSetCount: completedSetCount,
    hasNoExercises,
  });
  
  return {
    endedEarly,
    workingSets: completedSetCount,
    plannedSets: totalPlannedSets,
  };
}

/**
 * Load ended-early summary for a session.
 * 
 * @param supabase Supabase client
 * @param sessionId Session ID to check
 * @returns Summary with endedEarly flag and set counts, or null if query fails
 */
export async function loadEndedEarlySummary(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<EndedEarlySummary | null> {
  const { data, error } = await supabase
    .from("session_exercises")
    .select("id, status, planned_sets, session_sets(reps, duration_seconds, is_warmup_set)")
    .eq("session_id", sessionId);
  
  if (error || !data) {
    return null;
  }
  
  return summarizeEndedEarly(data as SessionExerciseRow[]);
}
