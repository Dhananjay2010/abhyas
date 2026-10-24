/**
 * Exercise history query helpers for Abhyas.
 * 
 * These functions provide read-only access to a user's exercise performance history.
 * They are used by the session runner to show "last time" data and by History/Progress
 * pages to display trends and achievements.
 * 
 * All date/time logic uses the existing resolveTimezoneWithProfile helper to ensure
 * dates are interpreted in the user's timezone, not server time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  calculateEpley1RM,
  calculateSetVolume,
  findTopSet,
  detectPersonalRecords,
  type SetData,
  type PersonalRecord,
} from "./calculations";

type TypedSupabase = SupabaseClient<Database>;

/**
 * The most recent completed performance of an exercise.
 */
export interface LastPerformance {
  /** When this was performed (ISO date string: yyyy-mm-dd) */
  date: string;
  /** Session ID for linking */
  sessionId: string;
  /** All working sets (warmups excluded) */
  sets: SetData[];
  /** The best set from this session */
  topSet: SetData | null;
  /** Total volume in kg (reps × weight, 0 for bodyweight/timed) */
  volumeKg: number;
  /** Estimated 1RM from the top set (null for bodyweight/timed) */
  estimatedOneRepMax: number | null;
  /** Exercise metric used */
  metric: "reps" | "seconds";
}

/**
 * Get the most recent completed performance of an exercise.
 * 
 * Returns null if the user has never completed this exercise.
 * Only includes completed sessions with at least one non-warmup set.
 * 
 * This is designed to be cheap enough to call per-exercise in a session.
 * For batch lookups of many exercises, consider getBatchLastPerformance.
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param exerciseId - Exercise ID
 * @returns The most recent performance, or null
 */
export async function getLastPerformance(
  supabase: TypedSupabase,
  userId: string,
  exerciseId: string
): Promise<LastPerformance | null> {
  // First, get the most recent completed session containing this exercise
  // by querying sessions directly (ordering works correctly on sessions table)
  const { data: recentSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, local_date, completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(100); // Get recent sessions to find ones with this exercise

  if (sessionsError || !recentSessions || recentSessions.length === 0) {
    return null;
  }

  const sessionIds = recentSessions.map(s => s.id);

  // Find which of these sessions contain the target exercise
  const { data: sessionExercises, error: sessionExError } = await supabase
    .from("session_exercises")
    .select("id, session_id, metric")
    .in("session_id", sessionIds)
    .eq("exercise_id", exerciseId)
    .eq("status", "completed");

  if (sessionExError || !sessionExercises || sessionExercises.length === 0) {
    return null;
  }

  // Find the most recent session that has this exercise (by completed_at order)
  const mostRecentSessionExercise = sessionExercises[0]; // Already ordered by sessions query
  for (const se of sessionExercises) {
    const seSession = recentSessions.find(s => s.id === se.session_id);
    const currentSession = recentSessions.find(s => s.id === mostRecentSessionExercise.session_id);
    if (seSession && currentSession && seSession.completed_at! > currentSession.completed_at!) {
      Object.assign(mostRecentSessionExercise, se);
    }
  }

  const targetSession = recentSessions.find(s => s.id === mostRecentSessionExercise.session_id);
  if (!targetSession) return null;

  // Get the sets for this session_exercise
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds")
    .eq("session_exercise_id", mostRecentSessionExercise.id)
    .eq("is_warmup_set", false)
    .order("set_number");

  if (setsError || !sets || sets.length === 0) {
    return null;
  }

  const metric = mostRecentSessionExercise.metric as "reps" | "seconds";
  const topSet = findTopSet(sets, metric);
  const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
  const estimatedOneRepMax = topSet
    ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
    : null;

  return {
    date: targetSession.local_date,
    sessionId: targetSession.id,
    sets,
    topSet,
    volumeKg,
    estimatedOneRepMax,
    metric,
  };
}

/**
 * Batch variant of getLastPerformance for multiple exercises.
 * More efficient when you need "last time" data for many exercises at once.
 * 
 * Uses parallel queries to ensure each exercise gets its true latest performance.
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param exerciseIds - Array of exercise IDs
 * @returns Map of exerciseId -> LastPerformance (exercises never done are omitted)
 */
export async function getBatchLastPerformance(
  supabase: TypedSupabase,
  userId: string,
  exerciseIds: string[]
): Promise<Map<string, LastPerformance>> {
  if (exerciseIds.length === 0) {
    return new Map();
  }

  // Query each exercise in parallel to avoid the limit(100) bug
  // where one exercise's history pushes another out
  const results = await Promise.all(
    exerciseIds.map(exerciseId => 
      getLastPerformance(supabase, userId, exerciseId)
        .then(result => ({ exerciseId, result }))
    )
  );

  const map = new Map<string, LastPerformance>();
  for (const { exerciseId, result } of results) {
    if (result) {
      map.set(exerciseId, result);
    }
  }

  return map;
}

/**
 * One session in the exercise history.
 */
export interface ExerciseHistorySession {
  /** Session ID */
  sessionId: string;
  /** Local date (yyyy-mm-dd) */
  date: string;
  /** All working sets */
  sets: SetData[];
  /** Top set for this session */
  topSet: SetData | null;
  /** Total volume in kg */
  volumeKg: number;
  /** Best estimated 1RM for this session */
  estimatedOneRepMax: number | null;
  /** PRs achieved in this session (compared to all previous sessions) */
  prs: PersonalRecord[];
}

/**
 * Exercise history with pagination.
 */
export interface ExerciseHistory {
  /** Sessions containing this exercise, newest first */
  sessions: ExerciseHistorySession[];
  /** Total count of sessions (for pagination UI) */
  totalCount: number;
  /** Current PRs across all history */
  currentPRs: PersonalRecord[];
}

/**
 * Options for getExerciseHistory.
 */
export interface ExerciseHistoryOptions {
  /** Number of sessions to return (default: 10) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
}

/**
 * Get the complete history of an exercise for a user.
 * 
 * Returns sessions containing this exercise, newest first, with:
 * - Sets, top set, volume, and estimated 1RM per session
 * - PR detection: which sets were PRs at the time
 * - Current PRs across all history
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param exerciseId - Exercise ID
 * @param options - Pagination options
 * @returns Exercise history with PR detection
 */
export async function getExerciseHistory(
  supabase: TypedSupabase,
  userId: string,
  exerciseId: string,
  options: ExerciseHistoryOptions = {}
): Promise<ExerciseHistory> {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;

  // First get all completed sessions for this user
  const { data: allSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, local_date, completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (sessionsError || !allSessions) {
    return {
      sessions: [],
      totalCount: 0,
      currentPRs: [],
    };
  }

  const allSessionIds = allSessions.map(s => s.id);

  // Find which sessions contain this exercise
  const { data: allSessionExercises, error: sessionExError } = await supabase
    .from("session_exercises")
    .select("id, session_id, metric")
    .in("session_id", allSessionIds)
    .eq("exercise_id", exerciseId)
    .eq("status", "completed");

  if (sessionExError || !allSessionExercises || allSessionExercises.length === 0) {
    return {
      sessions: [],
      totalCount: 0,
      currentPRs: [],
    };
  }

  // Match session_exercises with sessions and sort by completed_at (newest first)
  const sessionsWithExercise = allSessionExercises
    .map(se => {
      const session = allSessions.find(s => s.id === se.session_id);
      return session ? { ...se, ...session } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));

  const totalCount = sessionsWithExercise.length;

  // Apply pagination
  const paginatedSessionExercises = sessionsWithExercise.slice(offset, offset + limit);

  if (paginatedSessionExercises.length === 0) {
    return {
      sessions: [],
      totalCount,
      currentPRs: [],
    };
  }

  // Get ALL sets for all sessions containing this exercise (for PR detection)
  const allSessionExerciseIds = sessionsWithExercise.map(se => se.id);
  const { data: allHistorySets, error: allSetsError } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds, completed_at, session_exercise_id")
    .in("session_exercise_id", allSessionExerciseIds)
    .eq("is_warmup_set", false)
    .order("completed_at");

  if (allSetsError || !allHistorySets) {
    return {
      sessions: [],
      totalCount,
      currentPRs: [],
    };
  }

  // Group sets by session_exercise_id for chronological PR detection
  const setsBySessionExercise = new Map<string, SetData[]>();
  for (const set of allHistorySets) {
    const sets = setsBySessionExercise.get(set.session_exercise_id) ?? [];
    sets.push({
      reps: set.reps,
      weight_kg: set.weight_kg,
      duration_seconds: set.duration_seconds,
    });
    setsBySessionExercise.set(set.session_exercise_id, sets);
  }

  // Get the metric - use the first session's metric as they should all be the same for an exercise
  // But validate per-session in case of historical data inconsistencies
  const primaryMetric = paginatedSessionExercises[0]?.metric as "reps" | "seconds";

  // Build complete chronological set history for PR detection
  const allCompletedSets: SetData[] = [];
  for (let i = sessionsWithExercise.length - 1; i >= 0; i--) {
    const se = sessionsWithExercise[i];
    const sets = setsBySessionExercise.get(se.id) ?? [];
    allCompletedSets.push(...sets);
  }

  // Detect current PRs from complete history
  const currentPRs = detectPersonalRecords(allCompletedSets, primaryMetric);

  // Build session history with per-session PR detection
  const sessions: ExerciseHistorySession[] = [];

  for (let i = 0; i < paginatedSessionExercises.length; i++) {
    const sessionExercise = paginatedSessionExercises[i];
    const sets = setsBySessionExercise.get(sessionExercise.id) ?? [];
    if (sets.length === 0) continue;

    // Use this session's metric (handles historical inconsistencies)
    const metric = (sessionExercise.metric || primaryMetric) as "reps" | "seconds";
    const topSet = findTopSet(sets, metric);
    const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
    const estimatedOneRepMax = topSet
      ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
      : null;

    // For PR detection: find all sets from strictly earlier sessions
    const sessionIndex = sessionsWithExercise.findIndex(s => s.id === sessionExercise.session_id);
    const setsBeforeThisSession: SetData[] = [];
    
    // Walk from oldest to this session (exclusive)
    for (let j = sessionsWithExercise.length - 1; j > sessionIndex; j--) {
      const earlierSe = sessionsWithExercise[j];
      const earlierSets = setsBySessionExercise.get(earlierSe.id) ?? [];
      setsBeforeThisSession.push(...earlierSets);
    }

    const prsBefore = detectPersonalRecords(setsBeforeThisSession, metric);

    // Check each set in this session for PRs
    const sessionPRs: PersonalRecord[] = [];
    for (const set of sets) {
      const setPRTypes: string[] = [];

      if (metric === "seconds") {
        const duration = set.duration_seconds ?? 0;
        const prevLongest = prsBefore.find(pr => pr.type === "longest_duration");
        if (duration > (prevLongest?.value ?? 0)) {
          setPRTypes.push("longest_duration");
        }
      } else {
        const weight = set.weight_kg ?? 0;
        const reps = set.reps ?? 0;
        const e1rm = calculateEpley1RM(reps, weight) ?? 0;

        if (weight > 0) {
          const prevHeaviest = prsBefore.find(pr => pr.type === "heaviest_weight");
          if (weight > (prevHeaviest?.value ?? 0)) {
            setPRTypes.push("heaviest_weight");
          }

          const prevBestE1rm = prsBefore.find(pr => pr.type === "best_e1rm");
          if (e1rm > (prevBestE1rm?.value ?? 0)) {
            setPRTypes.push("best_e1rm");
          }
        }

        const prevMostReps = prsBefore.find(pr => pr.type === "most_reps");
        if (reps > (prevMostReps?.value ?? 0)) {
          setPRTypes.push("most_reps");
        }
      }

      // Add unique PRs for this session
      for (const prType of setPRTypes) {
        if (!sessionPRs.some(pr => pr.type === prType)) {
          sessionPRs.push({
            type: prType as PersonalRecord["type"],
            set,
            value: metric === "seconds"
              ? (set.duration_seconds ?? 0)
              : prType === "heaviest_weight"
                ? (set.weight_kg ?? 0)
                : prType === "best_e1rm"
                  ? (calculateEpley1RM(set.reps, set.weight_kg) ?? 0)
                  : (set.reps ?? 0),
            e1rm: calculateEpley1RM(set.reps, set.weight_kg) ?? undefined,
          });
        }
      }
    }

    sessions.push({
      sessionId: sessionExercise.session_id,
      date: sessionExercise.local_date,
      sets,
      topSet,
      volumeKg,
      estimatedOneRepMax,
      prs: sessionPRs,
    });
  }

  return {
    sessions,
    totalCount,
    currentPRs,
  };
}
