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
  // Get the most recent completed session containing this exercise
  const { data: sessionExercises, error: sessionError } = await supabase
    .from("session_exercises")
    .select(`
      id,
      session_id,
      metric,
      sessions!inner(
        id,
        local_date,
        status,
        completed_at
      )
    `)
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("status", "completed")
    .eq("sessions.status", "completed")
    .not("sessions.completed_at", "is", null)
    .order("sessions.completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !sessionExercises) {
    return null;
  }

  // Get the sets for this exercise
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds")
    .eq("session_exercise_id", sessionExercises.id)
    .eq("is_warmup_set", false)
    .order("set_number");

  if (setsError || !sets || sets.length === 0) {
    return null;
  }

  const session = sessionExercises.sessions as unknown as {
    id: string;
    local_date: string;
    status: string;
    completed_at: string;
  };

  const metric = sessionExercises.metric as "reps" | "seconds";
  const topSet = findTopSet(sets, metric);
  const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
  const estimatedOneRepMax = topSet
    ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
    : null;

  return {
    date: session.local_date,
    sessionId: session.id,
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

  // Get the most recent completed session for each exercise
  // We use a window function approach by fetching recent sessions and filtering
  const { data: sessionExercises, error: sessionError } = await supabase
    .from("session_exercises")
    .select(`
      id,
      exercise_id,
      session_id,
      metric,
      sessions!inner(
        id,
        local_date,
        status,
        completed_at
      )
    `)
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .eq("status", "completed")
    .eq("sessions.status", "completed")
    .not("sessions.completed_at", "is", null)
    .order("sessions.completed_at", { ascending: false })
    .limit(100); // Reasonable limit for batch lookup

  if (sessionError || !sessionExercises || sessionExercises.length === 0) {
    return new Map();
  }

  // Group by exercise_id and take the most recent for each
  const latestByExercise = new Map<string, typeof sessionExercises[0]>();
  for (const se of sessionExercises) {
    if (!latestByExercise.has(se.exercise_id)) {
      latestByExercise.set(se.exercise_id, se);
    }
  }

  // Get all sets for these session_exercises
  const sessionExerciseIds = Array.from(latestByExercise.values()).map(se => se.id);
  const { data: allSets, error: setsError } = await supabase
    .from("session_sets")
    .select("session_exercise_id, reps, weight_kg, duration_seconds")
    .in("session_exercise_id", sessionExerciseIds)
    .eq("is_warmup_set", false)
    .order("set_number");

  if (setsError || !allSets) {
    return new Map();
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

  // Build the result map
  const result = new Map<string, LastPerformance>();

  for (const [exerciseId, sessionExercise] of latestByExercise) {
    const sets = setsBySessionExercise.get(sessionExercise.id) ?? [];
    if (sets.length === 0) continue;

    const session = sessionExercise.sessions as unknown as {
      id: string;
      local_date: string;
      status: string;
      completed_at: string;
    };

    const metric = sessionExercise.metric as "reps" | "seconds";
    const topSet = findTopSet(sets, metric);
    const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
    const estimatedOneRepMax = topSet
      ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
      : null;

    result.set(exerciseId, {
      date: session.local_date,
      sessionId: session.id,
      sets,
      topSet,
      volumeKg,
      estimatedOneRepMax,
      metric,
    });
  }

  return result;
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

  // Get total count
  const { count, error: countError } = await supabase
    .from("session_exercises")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("status", "completed")
    .eq("sessions.status", "completed");

  const totalCount = countError ? 0 : (count ?? 0);

  // Get paginated sessions
  const { data: sessionExercises, error: sessionError } = await supabase
    .from("session_exercises")
    .select(`
      id,
      session_id,
      metric,
      sessions!inner(
        id,
        local_date,
        status,
        completed_at
      )
    `)
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("status", "completed")
    .eq("sessions.status", "completed")
    .not("sessions.completed_at", "is", null)
    .order("sessions.completed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sessionError || !sessionExercises || sessionExercises.length === 0) {
    return {
      sessions: [],
      totalCount,
      currentPRs: [],
    };
  }

  // Get sets for all these session_exercises
  const sessionExerciseIds = sessionExercises.map(se => se.id);
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

  // Get ALL sets for PR detection (not just the paginated range)
  const { data: allHistorySets, error: allSetsError } = await supabase
    .from("session_sets")
    .select(`
      reps,
      weight_kg,
      duration_seconds,
      session_exercises!inner(
        exercise_id,
        status,
        sessions!inner(
          status,
          completed_at
        )
      )
    `)
    .eq("session_exercises.user_id", userId)
    .eq("session_exercises.exercise_id", exerciseId)
    .eq("session_exercises.status", "completed")
    .eq("session_exercises.sessions.status", "completed")
    .eq("is_warmup_set", false)
    .order("session_exercises.sessions.completed_at");

  const allCompletedSets: SetData[] = allHistorySets && !allSetsError
    ? allHistorySets.map(s => ({
        reps: s.reps,
        weight_kg: s.weight_kg,
        duration_seconds: s.duration_seconds,
      }))
    : [];

  // Detect current PRs from complete history
  const metric = sessionExercises[0]?.metric as "reps" | "seconds";
  const currentPRs = detectPersonalRecords(allCompletedSets, metric);

  // Build session history with per-session PR detection
  const sessions: ExerciseHistorySession[] = [];

  for (let i = 0; i < sessionExercises.length; i++) {
    const sessionExercise = sessionExercises[i];
    const sets = setsBySessionExercise.get(sessionExercise.id) ?? [];
    if (sets.length === 0) continue;

    const session = sessionExercise.sessions as unknown as {
      id: string;
      local_date: string;
      status: string;
      completed_at: string;
    };

    const topSet = findTopSet(sets, metric);
    const volumeKg = sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
    const estimatedOneRepMax = topSet
      ? calculateEpley1RM(topSet.reps, topSet.weight_kg)
      : null;

    // For PR detection: find which sets in THIS session were PRs at the time
    // We need to know what the PRs were BEFORE this session
    const sessionIndex = sessionExercises.length - 1 - i; // Reverse index (oldest first)
    const setsUpToThisSession = allCompletedSets.slice(0, sessionIndex * 4); // Rough estimate
    const prsBefore = detectPersonalRecords(setsUpToThisSession, metric);
    
    // Check each set in this session against the PRs before it
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
      
      // If this set achieved any PRs, add them to the session PRs
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
      sessionId: session.id,
      date: session.local_date,
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
