/**
 * Exercise history query helpers for Abhyas.
 *
 * These functions provide read-only access to a user's exercise performance history.
 * They use the exercise_history view for efficient querying with proper ordering.
 *
 * Dates are stored in local_date (date type) and are already in the user's timezone.
 * No timezone conversion is needed.
 *
 * @module exercise-history/queries
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  calculateEpley1RM,
  roundE1RM,
  calculateSetVolume,
  findTopSet,
  detectPersonalRecords,
  checkWeightedRepPR,
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
 * Only includes sessions with at least one non-warmup set (warm-up-only rows are skipped).
 *
 * Uses the exercise_history view for efficient querying with proper ordering.
 * The view already filters to rows with at least one working set.
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
  // The view already excludes warm-up-only rows (L1 fix)
  const { data: historyRow, error: historyError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id, session_id, local_date, metric, completed_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("completed_at", { ascending: false })
    .order("session_exercise_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (historyError) {
    throw new Error(`Failed to fetch last performance: ${historyError.message}`);
  }

  if (!historyRow || !historyRow.session_exercise_id || !historyRow.session_id || !historyRow.local_date || !historyRow.metric) {
    return null;
  }

  // Get the sets for this session_exercise
  // L1: Stable ordering to avoid duplicates/gaps across pagination
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds")
    .eq("session_exercise_id", historyRow.session_exercise_id)
    .eq("is_warmup_set", false)
    .order("set_number", { ascending: true })
    .order("id", { ascending: true });

  if (setsError) {
    throw new Error(`Failed to fetch sets: ${setsError.message}`);
  }

  if (!sets || sets.length === 0) {
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
 * - PR detection: which PRs were achieved in each session (at the time)
 * - Current PRs across all history
 *
 * Uses the exercise_history view for efficient paginated querying.
 * The view already filters to rows with at least one working set.
 *
 * PR detection logic (L4):
 * - A session beats every EARLIER session (chronological by completed_at, then id)
 * - Ties are not PRs (must strictly beat previous records)
 * - First session gets NO badges (baseline rule)
 * - Weighted most-reps: needs earlier set at EXACTLY same weight, AND
 *   more reps than every earlier set at weight ≥ current weight
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

  // Get total count using the view (the view already excludes warm-up-only rows)
  const { count, error: countError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);

  if (countError) {
    throw new Error(`Failed to count history: ${countError.message}`);
  }

  const totalCount = count ?? 0;

  if (totalCount === 0) {
    return {
      sessions: [],
      totalCount: 0,
      currentPRs: [],
    };
  }

  // For PR detection, fetch the complete chronological history in batches
  // L6: Page until we get back fewer rows than requested (signals end of data)
  const allHistoryRows: Array<{
    session_exercise_id: string | null;
    session_id: string | null;
    local_date: string | null;
    metric: string | null;
    completed_at: string | null;
  }> = [];

  let batchOffset = 0;
  const batchSize = 1000;  // Request size per page
  while (true) {
    const { data: batchRows, error: batchError } = await supabase
      .from("exercise_history")
      .select("session_exercise_id, session_id, local_date, metric, completed_at")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .order("completed_at", { ascending: true })
      .order("session_exercise_id", { ascending: true })
      .range(batchOffset, batchOffset + batchSize - 1);

    if (batchError) {
      throw new Error(`Failed to fetch history: ${batchError.message}`);
    }

    if (!batchRows || batchRows.length === 0) {
      break;
    }

    allHistoryRows.push(...batchRows);

    // L6: Stop when we get fewer rows than requested (end of data)
    // This works regardless of server's actual page size limit
    if (batchRows.length < batchSize) {
      break;
    }

    batchOffset += batchSize;
  }

  if (!allHistoryRows || allHistoryRows.length === 0) {
    return {
      sessions: [],
      totalCount: 0,
      currentPRs: [],
    };
  }

  // Use the first session's metric as primary (should be consistent for an exercise)
  const primaryMetric = (allHistoryRows[0]?.metric || "reps") as "reps" | "seconds";

  // Get sets for ALL session_exercises (for PR detection)
  const allSessionExerciseIds = allHistoryRows
    .map(row => row.session_exercise_id)
    .filter((id): id is string => id !== null);

  // Fetch all sets in batches to avoid URL length limits
  // L6: Each batch needs paging - loop until page comes back shorter than requested
  const allSetsBySessionExercise = new Map<string, SetData[]>();
  for (let i = 0; i < allSessionExerciseIds.length; i += 100) {
    const batch = allSessionExerciseIds.slice(i, i + 100);

    // Page through sets for this batch
    // L1: Stable ordering to avoid duplicates/gaps across pagination
    let setOffset = 0;
    const setPageSize = 1000;  // Request size per page
    while (true) {
      const { data: batchSets, error: setsError } = await supabase
        .from("session_sets")
        .select("session_exercise_id, reps, weight_kg, duration_seconds")
        .in("session_exercise_id", batch)
        .eq("is_warmup_set", false)
        .order("session_exercise_id", { ascending: true })
        .order("set_number", { ascending: true })
        .order("id", { ascending: true })
        .range(setOffset, setOffset + setPageSize - 1);

      if (setsError) {
        throw new Error(`Failed to fetch sets: ${setsError.message}`);
      }

      if (!batchSets || batchSets.length === 0) {
        break;
      }

      for (const set of batchSets) {
        const sets = allSetsBySessionExercise.get(set.session_exercise_id) ?? [];
        sets.push({
          reps: set.reps,
          weight_kg: set.weight_kg,
          duration_seconds: set.duration_seconds,
        });
        allSetsBySessionExercise.set(set.session_exercise_id, sets);
      }

      // L6: Stop when we get fewer rows than requested (end of data)
      // This works regardless of server's actual page size limit
      if (batchSets.length < setPageSize) {
        break;
      }

      setOffset += setPageSize;
    }
  }

  // Compute current PRs across all history (must be done regardless of displayed page)
  const allSets: SetData[] = [];
  for (const row of allHistoryRows) {
    if (row.session_exercise_id) {
      const sets = allSetsBySessionExercise.get(row.session_exercise_id) ?? [];
      allSets.push(...sets);
    }
  }
  const currentPRs = detectPersonalRecords(allSets, primaryMetric);

  // Get paginated history rows for display
  const { data: historyRows, error: historyError } = await supabase
    .from("exercise_history")
    .select("session_exercise_id, session_id, local_date, metric, completed_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("completed_at", { ascending: false })
    .order("session_exercise_id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (historyError) {
    throw new Error(`Failed to fetch paginated history: ${historyError.message}`);
  }

  if (!historyRows || historyRows.length === 0) {
    return {
      sessions: [],
      totalCount,
      currentPRs,
    };
  }

  // Build a map of session_exercise_id -> index for PR detection
  const sessionExIdToIndex = new Map<string, number>();
  for (let i = 0; i < allHistoryRows.length; i++) {
    const seId = allHistoryRows[i].session_exercise_id;
    if (seId) {
      sessionExIdToIndex.set(seId, i);
    }
  }

  // Precompute "sets before index i" for all displayed sessions in a single pass
  // This avoids O(displayed_sessions * history_size) redundant work
  const displayedIndices = new Set<number>();
  for (const historyRow of historyRows) {
    if (historyRow.session_exercise_id) {
      const idx = sessionExIdToIndex.get(historyRow.session_exercise_id);
      if (idx !== undefined) {
        displayedIndices.add(idx);
      }
    }
  }

  const setsBeforeIndex = new Map<number, SetData[]>();
  const accumulator: SetData[] = [];
  for (let i = 0; i < allHistoryRows.length; i++) {
    // If this index is displayed, save the sets before it
    if (displayedIndices.has(i)) {
      setsBeforeIndex.set(i, [...accumulator]);
    }
    // Add this index's sets to the accumulator
    const seId = allHistoryRows[i].session_exercise_id;
    if (seId) {
      const sets = allSetsBySessionExercise.get(seId) ?? [];
      accumulator.push(...sets);
    }
  }

  // Build session history with per-session PR detection
  const sessions: ExerciseHistorySession[] = [];

  for (const historyRow of historyRows) {
    // Skip rows with missing data
    if (!historyRow.session_exercise_id || !historyRow.session_id || !historyRow.local_date) {
      continue;
    }

    const sets = allSetsBySessionExercise.get(historyRow.session_exercise_id) ?? [];
    if (sets.length === 0) continue;

    const metric = (historyRow.metric || primaryMetric) as "reps" | "seconds";
    const topSet = findTopSet(sets, metric);
    const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
    const estimatedOneRepMax = topSet
      ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
      : null;

    // For PR detection: find all sets from strictly earlier sessions
    // Use precomputed setsBeforeIndex map for O(1) lookup
    const currentIndex = sessionExIdToIndex.get(historyRow.session_exercise_id) ?? -1;
    const setsBeforeThisSession = currentIndex >= 0
      ? (setsBeforeIndex.get(currentIndex) ?? [])
      : [];

    // Detect PRs that existed before this session
    const prsBefore = detectPersonalRecords(setsBeforeThisSession, metric);

    // Check if this session beats any previous records (strict >)
    const sessionPRs: PersonalRecord[] = [];

    // First session gets NO badges (baseline rule)
    const isFirstSession = setsBeforeThisSession.length === 0;
    if (isFirstSession) {
      // Skip PR detection for the very first session
    } else if (metric === "seconds") {
      // Time-based: longest_duration
      const longestInSession = Math.max(...sets.map(s => s.duration_seconds ?? 0));
      const prevLongest = prsBefore.find(pr => pr.type === "longest_duration");
      const prevValue = prevLongest?.value ?? 0;

      // First session: PR if value > 0
      // Later sessions: PR only if strictly greater
      if (longestInSession > prevValue) {
        const prSet = sets.find(s => (s.duration_seconds ?? 0) === longestInSession) ?? sets[0];
        sessionPRs.push({
          type: "longest_duration",
          set: prSet,
          value: longestInSession,
        });
      }
    } else {
      // Reps-based exercises
      // L2: Treat null and 0 weight as bodyweight explicitly
      const weightedSetsInSession = sets.filter(s => s.weight_kg !== null && s.weight_kg > 0);
      const bodyweightSetsInSession = sets.filter(s => s.weight_kg === null || s.weight_kg === 0);
      const hasWeight = weightedSetsInSession.length > 0;

      if (hasWeight) {
        // Weighted exercise PRs

        // 1. Heaviest weight
        const heaviestInSession = Math.max(...weightedSetsInSession.map(s => s.weight_kg ?? 0));
        const prevHeaviest = prsBefore.find(pr => pr.type === "heaviest_weight");
        const prevHeaviestValue = prevHeaviest?.value ?? 0;

        if (heaviestInSession > prevHeaviestValue) {
          const prSet = weightedSetsInSession.find(s => (s.weight_kg ?? 0) === heaviestInSession) ?? weightedSetsInSession[0];
          const e1rm = calculateEpley1RM(prSet.reps, prSet.weight_kg);
          sessionPRs.push({
            type: "heaviest_weight",
            set: prSet,
            value: heaviestInSession,
            e1rm: e1rm ?? undefined,
          });
        }

        // 2. Best e1RM (rounded to 0.1 kg for comparison to avoid float noise)
        const bestE1rmInSession = Math.max(...weightedSetsInSession.map(s => roundE1RM(calculateEpley1RM(s.reps, s.weight_kg))));
        const prevBestE1rm = prsBefore.find(pr => pr.type === "best_e1rm");
        const prevE1rmValue = roundE1RM(prevBestE1rm?.value ?? null);

        if (bestE1rmInSession > prevE1rmValue) {
          const prSet = weightedSetsInSession.find(s => roundE1RM(calculateEpley1RM(s.reps, s.weight_kg)) === bestE1rmInSession) ?? weightedSetsInSession[0];
          const actualE1rm = calculateEpley1RM(prSet.reps, prSet.weight_kg) ?? 0;
          sessionPRs.push({
            type: "best_e1rm",
            set: prSet,
            value: actualE1rm,
            e1rm: actualE1rm,
          });
        }

        // 3. Weighted most reps: same-weight comparison
        // L2: Only check weighted sets, not bodyweight
        const weightedSetsBeforeThisSession = setsBeforeThisSession.filter(s => s.weight_kg !== null && s.weight_kg > 0);
        let hasRepPR = false;
        let repPRSet: SetData | null = null;
        let repPRValue = 0;

        for (const currentSet of weightedSetsInSession) {
          if (checkWeightedRepPR(currentSet, weightedSetsBeforeThisSession)) {
            const currentReps = currentSet.reps ?? 0;
            if (!hasRepPR || currentReps > repPRValue) {
              hasRepPR = true;
              repPRSet = currentSet;
              repPRValue = currentReps;
            }
          }
        }

        if (hasRepPR && repPRSet) {
          const e1rm = calculateEpley1RM(repPRSet.reps, repPRSet.weight_kg) ?? undefined;
          sessionPRs.push({
            type: "most_reps",
            set: repPRSet,
            value: repPRValue,
            e1rm,
          });
        }

        // L2: Also check bodyweight sets independently for most_reps PRs
        if (bodyweightSetsInSession.length > 0) {
          const bodyweightSetsBeforeThisSession = setsBeforeThisSession.filter(s => s.weight_kg === null || s.weight_kg === 0);
          const mostBodyweightRepsInSession = Math.max(...bodyweightSetsInSession.map(s => s.reps ?? 0));
          const prevBodyweightMostReps = bodyweightSetsBeforeThisSession.length > 0
            ? Math.max(...bodyweightSetsBeforeThisSession.map(s => s.reps ?? 0))
            : 0;

          // Only create a bodyweight most_reps PR if it beats the previous bodyweight PR
          // AND it's higher than any weighted rep PR we just recorded
          if (mostBodyweightRepsInSession > prevBodyweightMostReps) {
            // If we didn't find a weighted rep PR, or bodyweight beats it
            if (!hasRepPR || mostBodyweightRepsInSession > repPRValue) {
              const prSet = bodyweightSetsInSession.find(s => (s.reps ?? 0) === mostBodyweightRepsInSession) ?? bodyweightSetsInSession[0];
              sessionPRs.push({
                type: "most_reps",
                set: prSet,
                value: mostBodyweightRepsInSession,
              });
            }
          }
        }
      } else {
        // Pure bodyweight: plain most-reps (no weight restriction)
        const mostRepsInSession = Math.max(...sets.map(s => s.reps ?? 0));
        const prevMostReps = prsBefore.find(pr => pr.type === "most_reps");
        const prevRepsValue = prevMostReps?.value ?? 0;

        if (mostRepsInSession > prevRepsValue) {
          const prSet = sets.find(s => (s.reps ?? 0) === mostRepsInSession) ?? sets[0];
          sessionPRs.push({
            type: "most_reps",
            set: prSet,
            value: mostRepsInSession,
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
