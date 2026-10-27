/**
 * Build history session summaries from raw Supabase rows.
 * 
 * Extracted from page.tsx to make the counting and aggregation logic testable.
 * Takes raw session and exercise rows, builds the aggregate maps (exercises,
 * planned sets, pending detection), and computes endedEarly for each session.
 * 
 * Working set counts must be provided (e.g. from detectSessionPRs or by calling
 * countWorkingSets on the raw sets).
 */

import { computeHistoryEndedEarlyForRow } from "./compute-ended-early-for-row";

export interface RawSessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  status: string;
  metric: string | null;
  planned_sets: number | null;
}

export interface RawSession {
  id: string;
  actual_type: string | null;
  status: string;
}

export interface SessionSummary {
  sessionId: string;
  endedEarly: boolean;
  workingSetCount: number;
  plannedSets: number | undefined;
  completedExercises: Array<{ id: string; exercise_id: string; metric: string }>;
}

/**
 * Build session summaries with endedEarly flags.
 * 
 * This function does what page.tsx:115-231 does:
 * - Build exercisesBySession (completed exercises only, for top set calc)
 * - Sum plannedSetsBySession (pending or completed, not skipped)
 * - Detect hasPendingExerciseBySession
 * - Compute endedEarly for each session
 * 
 * @param sessions - Raw session rows from Supabase
 * @param sessionExercises - Raw session_exercises rows
 * @param setCountsBySession - Map of sessionId to working set count
 * @returns Array of session summaries with derived fields
 */
export function buildHistorySessionSummaries(
  sessions: RawSession[],
  sessionExercises: RawSessionExercise[],
  setCountsBySession: Map<string, number>
): SessionSummary[] {
  // Build maps exactly like page.tsx:115-138 does
  const exercisesBySession = new Map<string, Array<{ id: string; exercise_id: string; metric: string }>>();
  const plannedSetsBySession = new Map<string, number>();
  const hasPendingExerciseBySession = new Map<string, boolean>();
  
  for (const ex of sessionExercises) {
    // Only add completed exercises for top set calculation
    if (ex.status === "completed") {
      const list = exercisesBySession.get(ex.session_id) ?? [];
      list.push({ id: ex.id, exercise_id: ex.exercise_id, metric: ex.metric ?? "reps" });
      exercisesBySession.set(ex.session_id, list);
    }
    
    // Sum planned_sets only over 'pending' or 'completed' exercises (exclude 'skipped' and 'swapped_out')
    if ((ex.status === "pending" || ex.status === "completed") && ex.planned_sets && ex.planned_sets > 0) {
      plannedSetsBySession.set(
        ex.session_id,
        (plannedSetsBySession.get(ex.session_id) ?? 0) + ex.planned_sets
      );
    }
    
    // Track if any exercise is still pending
    if (ex.status === "pending") {
      hasPendingExerciseBySession.set(ex.session_id, true);
    }
  }
  
  // Build summaries with endedEarly computed for each session
  return sessions.map(session => {
    const exercises = exercisesBySession.get(session.id) ?? [];
    const workingSetCount = setCountsBySession.get(session.id) ?? 0;
    const plannedSets = plannedSetsBySession.get(session.id);
    const hasPendingExercise = hasPendingExerciseBySession.get(session.id) ?? false;
    
    const endedEarly = computeHistoryEndedEarlyForRow({
      session: { actual_type: session.actual_type, status: session.status },
      exercises,
      workingSetCount,
      plannedSets,
      hasPendingExercise,
    });
    
    return {
      sessionId: session.id,
      endedEarly,
      workingSetCount,
      plannedSets,
      completedExercises: exercises,
    };
  });
}
