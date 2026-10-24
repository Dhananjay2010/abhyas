import type { Database } from "@/lib/database.types";
import { countWorkingSets } from "@/lib/session/count-sets";

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
 * 3. ZERO-SET SESSIONS: Strength sessions with 0 working sets (warmup-only) do
 *    NOT count toward streaks or training days. Working sets include both reps-based
 *    and timed/isometric holds (duration > 0).
 *
 * These rules are enforced in:
 * - countsTowardStreak() (training days, streaks)
 * - session_volume view (excludes 0-working-set strength)
 * - exercise_strength_history view (excludes 0-working-set strength)
 * - History list filter (excludes 0-working-set strength from "Lifts" tab)
 */

/**
 * Determine if a session counts toward training streaks and "days trained".
 *
 * Rules:
 * - Yoga: always counts
 * - Strength (weights/bodyweight): counts only if it has working sets (reps or timed)
 * - Breathing/meditation: never counts
 * - Rest/recovery: never counts
 *
 * @param sessionType - The session type
 * @param sets - Optional array of sets to validate working set count for strength
 * @returns true if the session counts toward streak/training-days
 */
export function countsTowardStreak(
  sessionType: SessionType | null,
  sets?: Array<{ is_warmup_set: boolean | null; reps: number | null; duration_seconds: number | null }>
): boolean {
  if (!sessionType) return false;

  // Yoga always counts
  if (sessionType === "yoga") return true;

  // Breathing never counts
  if (sessionType === "rest" || sessionType === "active_recovery" || sessionType === "meditation") {
    return false;
  }
  
  // Strength sessions (weights/bodyweight) must have working sets
  if (sessionType === "weights" || sessionType === "bodyweight") {
    // If sets provided, validate working set count
    if (sets !== undefined) {
      return countWorkingSets(sets) > 0;
    }
    // Backward compatible: assume valid if sets not provided
    return true;
  }
  
  return false;
}

/**
 * Determine if a session type "owns" a planned workout day for planning purposes.
 * 
 * Only strength sessions (weights/bodyweight) settle a day for planning purposes.
 * Yoga and breathing are "anytime" activities that don't block planning a strength workout.
 * 
 * @param sessionType - The session type
 * @returns true if this session type owns/settles the planned workout day
 */
export function ownsPlannedWorkout(sessionType: SessionType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight";
}
