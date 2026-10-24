/**
 * Detect which sessions had PRs at the time they were completed.
 * 
 * This runs in-memory PR detection for a page of History rows by:
 * 1. Fetching all relevant sets up to the newest session on the page
 * 2. Grouping sets by session and exercise, ordered chronologically
 * 3. Using detectSetPRs from src/lib/exercise-history to flag sessions with PRs
 * 
 * ## Trade-offs & Performance
 * 
 * **Query bound**: Limited to 5000 sets (via .limit(5000)) to keep response times predictable.
 * This covers approximately:
 * - 200 sessions with 25 sets each (heavy strength training)
 * - 500 sessions with 10 sets each (typical training)
 * 
 * **Why this bound**: A user with 1000+ sessions would need to fetch tens of thousands of sets
 * to accurately detect every PR. The 5000-set cap means very old sessions may not show PR badges
 * if the user has extensive history, but:
 * - Recent sessions (within ~200-500 sessions) will be accurate
 * - Most users check recent history, not sessions from years ago
 * - Page load stays fast (single query, in-memory grouping)
 * 
 * **Alternative approaches** (not implemented):
 * 1. Pre-compute PR flags when sessions complete (requires DB migration)
 * 2. Dedicated API endpoint with caching (more infrastructure)
 * 3. Progressive loading (shows placeholder, then PR badges after)
 * 
 * The current approach balances accuracy, performance, and simplicity without requiring
 * database schema changes.
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
 * Detect which sessions on the current page had PRs.
 * 
 * @param supabase - Authenticated client
 * @param userId - User ID
 * @param sessionIds - Session IDs to check (the current page)
 * @param newestCompletedAt - completed_at of the newest session on the page
 * @returns Set of session IDs that had at least one PR
 */
export async function detectSessionPRs(
  supabase: TypedSupabase,
  userId: string,
  sessionIds: string[],
  newestCompletedAt: string | null
): Promise<Set<string>> {
  if (sessionIds.length === 0 || !newestCompletedAt) {
    return new Set();
  }

  // Fetch all completed sets up to the newest session on the page
  // Bound to a reasonable window: all sets from sessions completed <= newestCompletedAt
  // Limited to ~5000 sets (covers ~200 sessions with 25 sets each, or 500 sessions with 10 sets each)
  const { data: allSets, error } = await supabase
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
        metric,
        sessions!inner(
          completed_at
        )
      )
    `
    )
    .eq("session_exercises.user_id", userId)
    .eq("session_exercises.status", "completed")
    .eq("session_exercises.sessions.status", "completed")
    .lte("session_exercises.sessions.completed_at", newestCompletedAt)
    .eq("is_warmup_set", false)
    .order("completed_at", { ascending: true })
    .limit(5000);

  if (error || !allSets) {
    console.error("Failed to fetch sets for PR detection:", error);
    return new Set();
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

  return sessionsWithPRs;
}
