import type { Database } from "@/lib/database.types";

type SessionType = Database["public"]["Enums"]["day_type"];

/**
 * SHARED RULES (h3 decision, 2026-10-24):
 *
 * 1. TRAINING DAYS & STREAKS: Strength (weights/bodyweight) and yoga sessions
 *    count toward "days trained" and streaks. Breathing practices do NOT count.
 *
 * 2. PLANNING: Only strength sessions (weights/bodyweight) settle a day for
 *    planning purposes. Yoga and breathing are "anytime" activities that don't
 *    block planning a strength workout.
 *
 * Per SPEC.md §6: "Yoga days **count as training days** and are placed to
 * avoid sitting next to the heaviest leg day."
 *
 * These rules apply to streak calculation, progress stats, history display,
 * and Today's prompt logic.
 */

/**
 * Returns true if a session type counts toward "days trained" and streaks.
 * 
 * Product rule: ANY completed strength or yoga session counts, regardless of
 * the template schedule. A "train anyway" session on a rest day counts.
 * Breathing practices never count.
 *
 * For strength sessions (weights/bodyweight): must have at least one working set
 * (warmup-only sessions don't count). Pass sets for validation or omit for
 * type-only check (backward compatible).
 *
 * Training sessions: weights, bodyweight, yoga
 * Non-training: rest, active_recovery, meditation (breathing)
 */
export function countsTowardStreak(
  sessionType: SessionType | null,
  sets?: Array<{ is_warmup_set: boolean | null; reps: number | null; duration_seconds: number | null }>
): boolean {
  if (!sessionType) return false;
  
  // Yoga always counts by type
  if (sessionType === "yoga") return true;
  
  // Breathing never counts
  if (sessionType === "rest" || sessionType === "active_recovery" || sessionType === "meditation") {
    return false;
  }
  
  // Strength sessions (weights/bodyweight) must have working sets
  if (sessionType === "weights" || sessionType === "bodyweight") {
    // If sets provided, validate working set count
    if (sets !== undefined) {
      const { countWorkingSets } = require("@/lib/session/count-sets");
      return countWorkingSets(sets) > 0;
    }
    // Backward compatible: assume valid if sets not provided
    return true;
  }
  
  return false;
}

/**
 * Returns true if a completed session "owns the day" for planning purposes —
 * meaning it settles the day and blocks planning another strength workout.
 *
 * Only STRENGTH sessions settle the day. Yoga and breathing are "anytime"
 * activities: a yoga or breathing session in the morning doesn't make the
 * day unplannable for a strength workout.
 *
 * Used in session/actions.ts: a completed breathing or yoga session still
 * leaves the day available for a strength session.
 */
export function ownsPlannedWorkout(sessionType: SessionType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight";
}

/**
 * Filter completed sessions to only those that count toward "days trained".
 *
 * Used in Progress page for the "Days trained" stat.
 */
export function countTrainingSessions(
  sessions: Array<{ status: string; actual_type: SessionType | null }>,
): number {
  return sessions.filter((s) => s.status === "completed" && countsTowardStreak(s.actual_type)).length;
}
