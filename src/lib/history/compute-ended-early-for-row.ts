/**
 * Compute whether a session ended early, given the per-row data.
 * 
 * Extracted from page.tsx's mapping logic so tests can verify the count computation
 * and helper call with real-shaped rows.
 */

import { computeHistoryEndedEarly } from "./compute-ended-early";

export interface HistoryEndedEarlyInput {
  session: {
    actual_type: string | null;
    status: string;
  };
  exercises: Array<{ id: string }>;
  workingSetCount: number;
  plannedSets: number | undefined;
  hasPendingExercise: boolean;
}

export function computeHistoryEndedEarlyForRow(input: HistoryEndedEarlyInput): boolean {
  const { session, exercises, workingSetCount, plannedSets, hasPendingExercise } = input;
  
  const actualType = session.actual_type ?? "weights";
  const isBreathing = actualType === "meditation";
  const hasNoExercises = exercises.length === 0;
  const isStrength = !isBreathing && actualType !== "yoga";
  
  return computeHistoryEndedEarly({
    hasPendingExercise,
    plannedSets,
    workingSetCount,
    isStrength,
    status: session.status,
    hasNoExercises,
  });
}
