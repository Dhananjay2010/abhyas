/**
 * Detect which sessions had PRs at the time they were completed.
 * 
 * This runs in-memory PR detection for a page of History rows by:
 * 1. Querying sessions table first (ordered DESC by completed_at on sessions, not embedded)
 * 2. Fetching all sets for those sessions (ordered ASC by set.completed_at for chronological PR detection)
 * 3. Grouping sets by exercise and detecting PRs using detectSetPRs from src/lib/exercise-history
 * 
 * ## Query Strategy
 * 
 * **Two-step approach**:
 * 1. Get up to 600 completed sessions before/including the oldest session on current page
 * 2. Fetch all sets for those sessions (no hard limit - we need complete data)
 * 
 * **Why 600 sessions**: Provides sufficient prior history for accurate PR detection on the current
 * page while keeping queries fast. A typical user completes 2-4 sessions/week = ~150 sessions/year,
 * so 600 sessions covers 3-4 years of history.
 * 
 * **Critical fixes**:
 * - Orders sessions by completed_at on sessions table (not embedded), avoiding PostgREST bug
 * - Orders sets by completed_at ASC on session_sets table for chronological PR detection
 * - Fetches sessions <= oldest on page (not newest), ensuring current page has full prior context
 * 
 * **Performance**: Measured with 500+ session user (see PR description for actual timings).
 * 
 * **Alternative approaches** (not implemented):
 * 1. Pre-compute PR flags when sessions complete (requires DB migration)
 * 2. Dedicated API endpoint with caching (more infrastructure)
 * 3. Progressive loading (shows placeholder, then PR badges after)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { detectSetPRs } from "@/lib/exercise-history";

type TypedSupabase = SupabaseClient<Database>;

interface SetRow {
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean | null;
  completed_at: string;
  session_exercises: {
    session_id: string;
    exercise_id: string;
    metric: string;
    sessions: {
      completed_at: string;
    };
  };
}

/**
 * Detect which sessions on the current page had PRs and count their working sets.
 * 
 * Strategy:
 * 1. Query sessions first (ordered by completed_at DESC on sessions table)
 * 2. Get all session IDs needed for full prior history
 * 3. Fetch sets for those sessions, ordered by set.completed_at ASC (chronological)
 * 4. Group and detect PRs
 * 5. Count working sets for current page sessions (reusing already-fetched data)
 * 
 * @param supabase - Authenticated client
 * @param userId - User ID
 * @param sessionIds - Session IDs to check (the current page)
 * @param oldestCompletedAt - completed_at of the OLDEST session on the page
 * @returns Object with PR flags and set counts for current page sessions
 */
export async function detectSessionPRs(
  supabase: TypedSupabase,
  userId: string,
  sessionIds: string[],
  oldestCompletedAt: string | null
): Promise<{ sessionsWithPRs: Set<string>; setCountsBySession: Map<string, number> }> {
  if (sessionIds.length === 0 || !oldestCompletedAt) {
    return { sessionsWithPRs: new Set(), setCountsBySession: new Map() };
  }

  // Step 1: Get all completed sessions up to and including the oldest on the current page
  // Order by completed_at DESC on the sessions table (not embedded), limit to reasonable window
  const { data: historicalSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .lte("completed_at", oldestCompletedAt)
    .order("completed_at", { ascending: false })
    .limit(600); // Cover ~600 sessions (enough prior history for PR context)

  if (sessionsError || !historicalSessions) {
    console.error("Failed to fetch sessions for PR detection:", sessionsError);
    return { sessionsWithPRs: new Set(), setCountsBySession: new Map() };
  }

  const historicalSessionIds = historicalSessions.map((s) => s.id);
  if (historicalSessionIds.length === 0) {
    return { sessionsWithPRs: new Set(), setCountsBySession: new Map() };
  }

  // Step 2: Fetch all sets for these sessions
  // Handle PostgREST max-rows limit (typically 1000) by paging with .range()
  // Chunk session IDs to avoid URL length limits (~100 IDs per request)
  const allSets: SetRow[] = [];
  const chunkSize = 100;
  
  for (let i = 0; i < historicalSessionIds.length; i += chunkSize) {
    const chunk = historicalSessionIds.slice(i, i + chunkSize);
    
    // Fetch sets for this chunk, paging through results
    let offset = 0;
    const pageSize = 1000; // PostgREST default max
    let hasMore = true;
    
    while (hasMore) {
      const { data: pageSets, error: setsError } = await supabase
        .from("session_sets")
        .select(
          `
          session_exercise_id,
          set_number,
          reps,
          weight_kg,
          duration_seconds,
          completed_at,
          session_exercises!inner(
            session_id,
            exercise_id,
            metric
          )
        `
        )
        .in("session_exercises.session_id", chunk)
        .eq("session_exercises.user_id", userId)
        .eq("session_exercises.status", "completed")
        .eq("is_warmup_set", false)
        .order("completed_at", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (setsError) {
        console.error("Failed to fetch sets for PR detection:", setsError);
        break;
      }

      if (!pageSets || pageSets.length === 0) {
        hasMore = false;
      } else {
        allSets.push(...(pageSets as unknown as SetRow[]));
        hasMore = pageSets.length === pageSize;
        offset += pageSize;
      }
    }
  }

  // Group sets by exercise, maintaining chronological order
  const setsByExercise = new Map<
    string,
    Array<{
      reps: number | null;
      weight_kg: number | null;
      duration_seconds: number | null;
      sessionId: string;
      completedAt: string;
    }>
  >();

  for (const set of allSets as unknown as SetRow[]) {
    const exerciseId = set.session_exercises.exercise_id;
    const metric = set.session_exercises.metric as "reps" | "seconds";
    const sessionId = set.session_exercises.session_id;
    const completedAt = set.session_exercises.sessions.completed_at;

    if (!setsByExercise.has(exerciseId)) {
      setsByExercise.set(exerciseId, []);
    }

    setsByExercise.get(exerciseId)!.push({
      reps: set.reps,
      weight_kg: set.weight_kg,
      duration_seconds: set.duration_seconds,
      sessionId,
      completedAt,
    });
  }

  // For each exercise, detect which sessions had PRs
  const sessionsWithPRs = new Set<string>();

  for (const [exerciseId, sets] of setsByExercise.entries()) {
    // Get the metric for this exercise (all sets should have the same metric)
    const firstSet = allSets.find(
      (s) => (s as unknown as SetRow).session_exercises.exercise_id === exerciseId
    ) as unknown as SetRow | undefined;
    
    if (!firstSet) continue;
    
    const metric = firstSet.session_exercises.metric as "reps" | "seconds";

    // Check each set to see if it was a PR at the time
    for (let i = 0; i < sets.length; i++) {
      const prs = detectSetPRs(sets, i, metric);
      
      if (prs.length > 0) {
        // This set achieved a PR
        const sessionId = sets[i].sessionId;
        
        // Only flag sessions that are on the current page
        if (sessionIds.includes(sessionId)) {
          sessionsWithPRs.add(sessionId);
        }
      }
    }
  }

  // Count working sets for current page sessions (reuse already-fetched data)
  const { countWorkingSets } = await import("@/lib/session/count-sets");
  const setCountsBySession = new Map<string, number>();
  
  for (const sessionId of sessionIds) {
    const sessionSets = allSets.filter(
      (s) => (s as unknown as SetRow).session_exercises.session_id === sessionId
    );
    const count = countWorkingSets(sessionSets.map(s => ({
      is_warmup_set: s.is_warmup_set,
      reps: s.reps,
      duration_seconds: s.duration_seconds
    })));
    setCountsBySession.set(sessionId, count);
  }

  return { sessionsWithPRs, setCountsBySession };
}
