/**
 * Pure helper for attaching working set counts to yesterday's sessions.
 * 
 * Takes the session_exercises query result and yesterday's sessions,
 * and returns either sessions with counts or null (unknown state on error).
 * 
 * When the query errors, returns null to signal unknown state - this prevents
 * treating an errored read as 0 working sets, which would incorrectly mark
 * yesterday as missed.
 */

import { workingSetCountsBySession, type SessionExerciseWithSets } from "./working-set-counts";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type YesterdaySession = {
  id: string;
  status: string;
  actual_type: DayType | null;
  program_id: string | null;
};

export type YesterdaySessionWithCount = YesterdaySession & {
  working_set_count: number;
};

export type SessionExercisesQueryResult = {
  data: SessionExerciseWithSets[] | null;
  error: Error | null;
};

/**
 * Attach working set counts to yesterday's sessions.
 * Returns null if the query errored (unknown state).
 */
export function attachWorkingSetCounts(
  queryResult: SessionExercisesQueryResult,
  sessions: YesterdaySession[]
): YesterdaySessionWithCount[] | null {
  // Query failed - return null to signal unknown state
  if (queryResult.error) {
    return null;
  }

  // Compute working set counts using pure helper
  const workingSetCounts = workingSetCountsBySession(queryResult.data ?? []);

  // Attach counts to sessions
  return sessions.map(s => ({
    ...s,
    working_set_count: workingSetCounts.get(s.id) ?? 0
  }));
}
