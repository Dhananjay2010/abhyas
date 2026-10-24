import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];
type SessionType = Database["public"]["Enums"]["day_type"];

/**
 * SHARED RULE (h3 decision, 2026-10-24):
 *
 * Strength and yoga sessions count toward streaks and "days trained".
 * Breathing practices do NOT count.
 *
 * Per SPEC.md §6: "Yoga days **count as training days** and are placed to
 * avoid sitting next to the heaviest leg day."
 *
 * This rule applies to:
 * - Streak calculation (current, longest, days trained)
 * - Session ownership (whether a session "owns" the day for planning)
 * - Progress stats
 * - History display
 * - Today's prompt logic
 *
 * Breathing practices appear in History and have their own week strip on the
 * Breathe tab, labeled clearly as "Breathing practice" to avoid confusion.
 */

/**
 * Returns true if a day type represents a training day that counts toward
 * streaks and "days trained" statistics.
 *
 * Training days: weights, bodyweight, yoga
 * Non-training: rest, active_recovery, meditation (breathing)
 */
export function isTrainingDay(dayType: DayType): boolean {
  return dayType === "weights" || dayType === "bodyweight" || dayType === "yoga";
}

/**
 * Returns true if a completed session "owns the day" — meaning it counts
 * toward the streak and prevents the "missed day" prompt.
 *
 * Same rule as isTrainingDay: strength (weights/bodyweight) and yoga count;
 * breathing practices (meditation type) do not.
 *
 * Used in session/actions.ts for planning logic: a completed breathing session
 * still leaves the day available for a strength or yoga session.
 */
export function sessionOwnsDay(sessionType: SessionType | null): boolean {
  if (!sessionType) return false;
  return isTrainingDay(sessionType);
}

/**
 * Filter completed sessions to only those that count toward "days trained".
 *
 * Used in Progress page for the "Days trained" stat.
 */
export function countTrainingSessions(
  sessions: Array<{ status: string; actual_type: SessionType | null }>,
): number {
  return sessions.filter((s) => s.status === "completed" && sessionOwnsDay(s.actual_type)).length;
}

/**
 * Check if a date has a completed training session.
 *
 * Used by buildDayRecords when constructing streak history.
 */
export function dateHasTrainingSession(
  sessions: Array<{ local_date: string; status: string; actual_type: SessionType | null }>,
  date: string,
): boolean {
  return sessions.some(
    (s) =>
      s.local_date === date && s.status === "completed" && sessionOwnsDay(s.actual_type),
  );
}
