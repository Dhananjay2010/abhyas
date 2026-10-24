import type { Database } from "@/lib/database.types";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";

/**
 * Pick a session from today that can be reused rather than creating a new one.
 *
 * Exported for testability (test-abandon-session.ts).
 */
export function pickReusableSession<T extends {
  id: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
}>(
  todayRows: T[],
  resumeEnabled: boolean,
): T | undefined {
  return resumeEnabled
    ? todayRows.find((s) => s.status === "planned" || s.status === "in_progress") ??
      /*
        An attempt that was ended early. `abandonSession` writes `skipped`, which
        used to be in neither of the statuses this looked for, so pressing Start
        again inserted a SECOND row for the same day: start, quit, start, quit
        left four identical "Skipped" entries in History and stranded the sets
        logged in each of them. Reusing the row means one entry per day and the
        earlier sets come back with it.

        Only the day's own workout qualifies. A skipped yoga or breathing row must
        not be turned into a strength session.
      */
      todayRows.find((s) => s.status === "skipped" && ownsPlannedWorkout(s.actual_type))
    : // When resume is disabled, only reuse a planned session (from the "what
      // about tomorrow?" prompt), never one that was started and abandoned.
      todayRows.find((s) => s.status === "planned");
}
