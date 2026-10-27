/**
 * Build complete History page view-model rows from raw Supabase data.
 * 
 * Extracted from page.tsx to make the entire row-mapping logic testable.
 * Takes all raw query results and returns SessionListItem[] ready for rendering.
 * 
 * This covers all the counting, aggregation, and per-row computation that
 * page.tsx previously did inline.
 */

import type { SessionListItem } from "@/app/history/types";
import { buildHistorySessionSummaries } from "./build-session-summaries";
import type { RawSession, RawSessionExercise } from "./build-session-summaries";
import { computeSessionDuration } from "./compute-duration";
import { findLatestSetCompletion } from "./find-latest-set-completion";

export interface RawSessionForList extends RawSession {
  local_date: string;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  is_deload: boolean | null;
  program_days: { label: string | null } | null;
  breathing_logs: Array<{ breaths: number; routine_name: string | null }> | null;
  breathing_patterns: { name: string; phases: unknown } | null;
}

export interface VolumeRow {
  session_id: string | null;
  volume_kg: number | string | null;
}

export interface SessionSetForTopSet {
  session_exercise_id: string;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean | null;
  completed_at: string | null;
}

/**
 * Build SessionListItem[] with all derived fields.
 * 
 * @param sessions - Raw session rows with all display fields
 * @param sessionExercises - Raw session_exercises rows
 * @param sessionSets - Raw session_sets rows for top set calculation
 * @param volumeData - Volume rows from session_volume
 * @param setCountsBySession - Map of sessionId to working set count (from detectSessionPRs)
 * @param sessionsWithPRs - Set of session IDs that had PRs (from detectSessionPRs)
 * @param pickTopSet - Helper function to find heaviest set
 * @returns Array of SessionListItem ready for rendering
 */
export function buildHistoryListItems(
  sessions: RawSessionForList[],
  sessionExercises: RawSessionExercise[],
  sessionSets: SessionSetForTopSet[],
  volumeData: VolumeRow[],
  setCountsBySession: Map<string, number>,
  sessionsWithPRs: Set<string>,
  pickTopSet: (sets: Array<{ reps: number | null; weight_kg: number | null; duration_seconds: number | null; is_warmup_set: boolean | null }>) => number | null
): SessionListItem[] {
  // Build summaries (exercises, planned sets, pending, endedEarly)
  const sessionSummaries = buildHistorySessionSummaries(
    sessions.map(s => ({ id: s.id, actual_type: s.actual_type, status: s.status })),
    sessionExercises,
    setCountsBySession
  );
  const summariesById = new Map(sessionSummaries.map(s => [s.sessionId, s]));
  
  // Index volume by session
  const volumeById = new Map(volumeData.map(v => [v.session_id, v]));
  
  // Index sets by session_exercise_id for top set calculation
  const setsByExercise = new Map<string, typeof sessionSets>();
  for (const set of sessionSets) {
    const list = setsByExercise.get(set.session_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.session_exercise_id, list);
  }
  
  // Index sets by session_id for last completed_at lookup (L-4)
  const setsBySession = new Map<string, typeof sessionSets>();
  for (const set of sessionSets) {
    // Find the session_id via exercises
    const exercise = sessionExercises.find(ex => ex.id === set.session_exercise_id);
    if (exercise) {
      const list = setsBySession.get(exercise.session_id) ?? [];
      list.push(set);
      setsBySession.set(exercise.session_id, list);
    }
  }
  
  // Map each session to a SessionListItem
  return sessions.map(s => {
    const vol = volumeById.get(s.id);
    const isBreathing = s.actual_type === "meditation";
    const summary = summariesById.get(s.id);
    const exercises = summary?.completedExercises ?? [];
    const workingSetCount = summary?.workingSetCount ?? 0;
    
    // Calculate top set weight for strength sessions
    let topSetWeight: number | null = null;
    if (!isBreathing && exercises.length > 0) {
      const allSets = exercises.flatMap(ex => setsByExercise.get(ex.id) ?? []);
      topSetWeight = pickTopSet(allSets);
    }
    
    // Check if this session had any PRs
    const hasPR = sessionsWithPRs.has(s.id);
    
    // Process breathing logs
    const logs = s.breathing_logs ?? [];
    const routineName = logs.find(l => l.routine_name)?.routine_name ?? null;
    const pattern = s.breathing_patterns;
    const pumps =
      routineName === null &&
      Array.isArray(pattern?.phases) &&
      pattern.phases.some(
        (p) => typeof p === "object" && p !== null && "kind" in p && p.kind === "pump"
      );
    
    const endedEarly = summary?.endedEarly ?? false;
    const plannedSets = summary?.plannedSets ?? null;
    
    // L-4: Compute duration from timestamps when duration_seconds is null (legacy rows)
    const sessionSetList = setsBySession.get(s.id) ?? [];
    const lastSetCompletedAt = findLatestSetCompletion(sessionSetList);
    const durationSeconds = computeSessionDuration(
      s.duration_seconds,
      s.started_at,
      lastSetCompletedAt
    );
    
    return {
      id: s.id,
      localDate: s.local_date,
      status: s.status,
      actualType: s.actual_type,
      durationSeconds,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      isDeload: s.is_deload ?? false,
      endedEarly,
      plannedSets,
      programDayLabel: s.program_days?.label ?? null,
      setCount: workingSetCount,
      volumeKg: Number(vol?.volume_kg ?? 0),
      topSetWeight,
      hasPR,
      breathing: isBreathing
        ? {
            breaths: logs.length ? logs.reduce((n, l) => n + l.breaths, 0) : null,
            pumps,
            patternName: routineName ?? pattern?.name ?? null,
          }
        : null,
    };
  });
}
