/**
 * Compute endedEarly for a session given pre-computed aggregates.
 * 
 * Extracted from page.tsx's per-session mapping to enable testing the page's
 * actual logic with real-shaped rows (sessions, exercises, counts).
 */

import { computeHistoryEndedEarlyForRow } from "./compute-ended-early-for-row";

export interface SessionAggregates {
  exercisesBySession: Map<string, Array<{ id: string }>>;
  setCountsBySession: Map<string, number>;
  plannedSetsBySession: Map<string, number>;
  hasPendingExerciseBySession: Map<string, boolean>;
}

export interface SessionRow {
  id: string;
  actual_type: string | null;
  status: string;
}

/**
 * Compute whether a session ended early using page.tsx's exact logic.
 * 
 * Takes the session row and the pre-computed aggregate maps that page.tsx builds,
 * performs the lookups, and calls computeHistoryEndedEarlyForRow.
 */
export function computeSessionEndedEarly(
  session: SessionRow,
  aggregates: SessionAggregates
): boolean {
  const { exercisesBySession, setCountsBySession, plannedSetsBySession, hasPendingExerciseBySession } = aggregates;
  
  const exercises = exercisesBySession.get(session.id) ?? [];
  const workingSetCount = setCountsBySession.get(session.id) ?? 0;
  const plannedSets = plannedSetsBySession.get(session.id);
  const hasPendingExercise = hasPendingExerciseBySession.get(session.id) ?? false;
  
  return computeHistoryEndedEarlyForRow({
    session: { actual_type: session.actual_type, status: session.status },
    exercises,
    workingSetCount,
    plannedSets,
    hasPendingExercise,
  });
}

