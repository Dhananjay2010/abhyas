/**
 * Check if user has started any strength or yoga session.
 *
 * Used for:
 * - Welcome card display (before first session)
 * - First-day logic (day-one guard in missed-day detection)
 *
 * Yoga counts; Breathe doesn't.
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type HasStartedInput = {
  sessions: Array<{ actual_type: DayType | null; started_at: string | null }>;
};

export function hasStartedAnySession(input: HasStartedInput): boolean {
  return input.sessions.some(
    (s) =>
      s.started_at !== null &&
      (s.actual_type === "weights" || s.actual_type === "bodyweight" || s.actual_type === "yoga"),
  );
}
