/**
 * Pure helper to determine if today has been answered for the current program.
 * An "answer" is any choice made for today: Rest, Yoga, Breathing, Keep, or Swap.
 */

import { ownsPlannedWorkout } from "@/lib/progress/training-days";

export interface TodaySession {
  status: string;
  actual_type: string | null;
  program_id: string | null;
}

export function isTodayAnswered(
  todaySessions: TodaySession[],
  programId: string
): boolean {
  return todaySessions.some(
    (s) =>
      (s.status === "planned" || ownsPlannedWorkout(s.actual_type as "weights" | "bodyweight" | null)) &&
      s.program_id === programId
  );
}
