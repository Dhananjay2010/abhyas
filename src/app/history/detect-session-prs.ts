/**
 * Detect which sessions had PRs at the time they were completed.
 * 
 * STUB: PR detection API was removed in PR #69. This now returns empty PR results
 * but still counts working sets for the history page.
 * 
 * To restore PR detection, implement using the new detectPersonalRecords API from
 * src/lib/exercise-history/calculations.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type TypedSupabase = SupabaseClient<Database>;

/**
 * Detect which sessions on the current page had PRs and count their working sets.
 * 
 * @param supabase - Authenticated client
 * @param userId - User ID
 * @param sessionIds - Session IDs to check (the current page)
 * @param oldestCompletedAt - completed_at of the OLDEST session on the page (unused now)
 * @returns Object with PR flags (always empty) and set counts for current page sessions
 */
export async function detectSessionPRs(
  supabase: TypedSupabase,
  userId: string,
  sessionIds: string[],
  oldestCompletedAt: string | null
): Promise<{ sessionsWithPRs: Set<string>; setCountsBySession: Map<string, number> }> {
  if (sessionIds.length === 0) {
    return { sessionsWithPRs: new Set(), setCountsBySession: new Map() };
  }

  // Count working sets for current page sessions
  const { countWorkingSets } = await import("@/lib/session/count-sets");
  const setCountsBySession = new Map<string, number>();
  
  // Fetch sets for current page sessions
  const { data: sets, error } = await supabase
    .from("session_sets")
    .select("session_exercises!inner(session_id), is_warmup_set, reps, duration_seconds")
    .in("session_exercises.session_id", sessionIds);

  if (!error && sets) {
    for (const sessionId of sessionIds) {
      const sessionSets = sets.filter(
        (s: { session_exercises: { session_id: string } }) => 
          s.session_exercises.session_id === sessionId
      );
      const count = countWorkingSets(sessionSets.map(s => ({
        is_warmup_set: s.is_warmup_set,
        reps: s.reps,
        duration_seconds: s.duration_seconds
      })));
      setCountsBySession.set(sessionId, count);
    }
  }

  return { 
    sessionsWithPRs: new Set<string>(), // STUB: No PR detection
    setCountsBySession 
  };
}
