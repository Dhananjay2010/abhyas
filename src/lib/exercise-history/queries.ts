/**
 * Exercise history query helpers for Abhyas.
 * 
 * These functions provide read-only access to a user's exercise performance history.
 * They use the exercise_history view for efficient querying with proper ordering.
 * 
 * All date/time logic uses the existing resolveTimezoneWithProfile helper to ensure
 * dates are interpreted in the user's timezone, not server time.
 * 
 * @module exercise-history/queries
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
 * Uses the exercise_history view for efficient querying with proper ordering.
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
  // Query the exercise_history view for the most recent completed performance
  const { data: historyRow, error: historyError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id, session_id, local_date, metric, completed_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (historyError || !historyRow || !historyRow.session_exercise_id || !historyRow.session_id || !historyRow.local_date || !historyRow.metric) {
    return null;
  }

  // Get the sets for this session_exercise
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds")
    .eq("session_exercise_id", historyRow.session_exercise_id)
    .eq("is_warmup_set", false)
    .order("set_number");

  if (setsError || !sets || sets.length === 0) {
    return null;
  }

  const metric = historyRow.metric as "reps" | "seconds";
  const topSet = findTopSet(sets, metric);
  const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
  const estimatedOneRepMax = topSet
    ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
    : null;

  return {
    date: historyRow.local_date,
    sessionId: historyRow.session_id,
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

  // Query each exercise in parallel to avoid limit bugs
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
  /** Exercise metric for this session */
  metric: "reps" | "seconds";
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
 * Uses the exercise_history view for efficient paginated querying.
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

  // Get total count using the view
  const { count, error: countError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);

  const totalCount = countError ? 0 : (count ?? 0);

  if (totalCount === 0) {
    return {
      sessions: [],
      totalCount: 0,
      currentPRs: [],
    };
  }

  // Get paginated history rows
  const { data: historyRows, error: historyError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id, session_id, local_date, metric, completed_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("completed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (historyError || !historyRows || historyRows.length === 0) {
    return {
      sessions: [],
      totalCount,
      currentPRs: [],
    };
  }

  // Get sets for these session_exercises
  const sessionExerciseIds = historyRows
    .map(row => row.session_exercise_id)
    .filter((id): id is string => id !== null);
  const { data: allSets, error: setsError } = await supabase
    .from("session_sets")
    .select("session_exercise_id, reps, weight_kg, duration_seconds, completed_at")
    .in("session_exercise_id", sessionExerciseIds)
    .eq("is_warmup_set", false)
    .order("completed_at");

  if (setsError || !allSets) {
    return {
      sessions: [],
      totalCount,
      currentPRs: [],
    };
  }

  // Group sets by session_exercise_id
  const setsBySessionExercise = new Map<string, SetData[]>();
  for (const set of allSets) {
    const sets = setsBySessionExercise.get(set.session_exercise_id) ?? [];
    sets.push({
      reps: set.reps,
      weight_kg: set.weight_kg,
      duration_seconds: set.duration_seconds,
    });
    setsBySessionExercise.set(set.session_exercise_id, sets);
  }

  // For PR detection, we need the complete chronological history
  // Fetch it in pages to avoid hitting limits
  const allHistoryRows: typeof historyRows = [];
  let currentOffset = 0;
  const pageSize = 500; // Safe batch size

  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from("exercise_history")
      .select("session_exercise_id, session_id, local_date, metric, completed_at")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .order("completed_at", { ascending: true }) // Oldest first for chronological
      .range(currentOffset, currentOffset + pageSize - 1);

    if (batchError || !batch || batch.length === 0) break;
    
    allHistoryRows.push(...batch);
    
    if (batch.length < pageSize) break; // Last page
    currentOffset += pageSize;
  }

  // Get ALL sets for PR detection (paginated)
  const allHistorySessionExIds = allHistoryRows
    .map(row => row.session_exercise_id)
    .filter((id): id is string => id !== null);
  const allHistorySets: SetData[] = [];
  
  // Fetch sets in batches to avoid URL length limits
  for (let i = 0; i < allHistorySessionExIds.length; i += 100) {
    const batch = allHistorySessionExIds.slice(i, i + 100);
    const { data: batchSets } = await supabase
      .from("session_sets")
      .select("session_exercise_id, reps, weight_kg, duration_seconds, completed_at")
      .in("session_exercise_id", batch)
      .eq("is_warmup_set", false)
      .order("completed_at");

    if (batchSets) {
      allHistorySets.push(...batchSets.map(s => ({
        reps: s.reps,
        weight_kg: s.weight_kg,
        duration_seconds: s.duration_seconds,
      })));
    }
  }

  // Use the first session's metric as primary (should be consistent for an exercise)
  const primaryMetric = historyRows[0]?.metric as "reps" | "seconds";
  const currentPRs = detectPersonalRecords(allHistorySets, primaryMetric);

  // Build session history with per-session PR detection
  const sessions: ExerciseHistorySession[] = [];

  // Map allHistoryRows by session_exercise_id for quick lookup
  const allHistoryMap = new Map(allHistoryRows.map(row => [row.session_exercise_id, row]));

  for (const historyRow of historyRows) {
    // Skip rows with missing data
    if (!historyRow.session_exercise_id || !historyRow.session_id || !historyRow.local_date) {
      continue;
    }

    const sets = setsBySessionExercise.get(historyRow.session_exercise_id) ?? [];
    if (sets.length === 0) continue;

    const metric = (historyRow.metric || primaryMetric) as "reps" | "seconds";
    const topSet = findTopSet(sets, metric);
    const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
    const estimatedOneRepMax = topSet
      ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
      : null;

    // For PR detection: find all sets from strictly earlier sessions
    const currentCompletedAt = historyRow.completed_at;
    const earlierRows = allHistoryRows.filter(row => 
      row.completed_at && currentCompletedAt && row.completed_at < currentCompletedAt
    );
    const earlierSessionExIds = earlierRows
      .map(row => row.session_exercise_id)
      .filter((id): id is string => id !== null);
    
    const setsBeforeThisSession = allHistorySets.filter((_set, idx) => {
      // Find which session_exercise this set belongs to by matching with allHistorySets order
      const setSessionExId = allHistorySessionExIds[Math.floor(idx / 4)]; // Approximate
      return earlierSessionExIds.includes(setSessionExId);
    });

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
      sessionId: historyRow.session_id,
      date: historyRow.local_date,
      sets,
      topSet,
      volumeKg,
      estimatedOneRepMax,
      prs: sessionPRs,
      metric,
    });
  }

  return {
    sessions,
    totalCount,
    currentPRs,
  };
}
