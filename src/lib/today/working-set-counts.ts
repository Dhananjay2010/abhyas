/**
 * Pure helper for computing working set counts per session.
 * 
 * Takes session_exercises rows with embedded session_sets and groups them by session_id,
 * then counts working sets for each session using countWorkingSets.
 */

import { countWorkingSets, type SetForCounting } from "@/lib/session/count-sets";

export type SessionExerciseWithSets = {
  session_id: string;
  session_sets: Array<{
    is_warmup_set: boolean | null;
    reps: number | null;
    duration_seconds: number | null;
  }>;
};

/**
 * Group session_exercises by session_id and compute working set counts.
 * 
 * @param sessionExercises - Array of session_exercises with embedded session_sets
 * @returns Map of session_id to working set count
 */
export function workingSetCountsBySession(
  sessionExercises: SessionExerciseWithSets[]
): Map<string, number> {
  const setsBySession = new Map<string, SetForCounting[]>();
  
  // Group all sets by session_id
  for (const exercise of sessionExercises) {
    const existing = setsBySession.get(exercise.session_id) ?? [];
    setsBySession.set(
      exercise.session_id,
      [...existing, ...exercise.session_sets]
    );
  }
  
  // Count working sets for each session
  const counts = new Map<string, number>();
  for (const [sessionId, sets] of setsBySession) {
    counts.set(sessionId, countWorkingSets(sets));
  }
  
  return counts;
}
