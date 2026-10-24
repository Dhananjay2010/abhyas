import type { Database } from "@/lib/database.types";
import { countWorkingSets } from "@/lib/session/count-sets";

type SessionType = Database["public"]["Enums"]["day_type"];

/**
 * SHARED RULES (h3 decision, 2026-10-24):
 *
 * 1. TRAINING DAYS & STREAKS: 
 *    - Strength (weights/bodyweight) sessions count ONLY when:
 *      status = 'completed' AND working_sets >= 1
 *    - Yoga sessions count when: status = 'completed'
 *    - Breathing practices NEVER count
 *    - A 'skipped' strength session NEVER counts
 *    - A legacy 'completed' strength session with 0 sets NEVER counts
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
 * - countsTowardStreak() (training days, streaks) - single source of truth
 * - session_volume view (excludes 0-working-set strength)
 * - exercise_strength_history view (excludes 0-working-set strength)
 * - History list filter (excludes 0-working-set strength from "Lifts" tab)
 */

/**
 * Determine if a session TYPE counts toward training streaks and "days trained".
 *
 * IMPORTANT: This function classifies session TYPES, not individual sessions.
 * Callers must pre-filter sessions to ensure:
 * - status = 'completed' (not 'skipped', 'planned', etc.)
 * - strength sessions have working_sets >= 1 (join with session_volume)
 *
 * Rules (product rule 2026-10-24):
 * - Yoga: counts
 * - Strength (weights/bodyweight): counts (but caller must ensure working_sets >= 1)
 * - Breathing/meditation: NEVER counts
 * - Rest/recovery: NEVER counts
 *
 * @param sessionType - The session type
 * @returns true if this session type can count toward streak/training-days
 */
export function countsTowardStreak(
  sessionType: SessionType | null
): boolean {
  if (!sessionType) return false;

  // Yoga counts
  if (sessionType === "yoga") return true;

  // Strength counts (caller must ensure working_sets >= 1)
  if (sessionType === "weights" || sessionType === "bodyweight") {
    return true;
  }

  // Breathing/rest/recovery never count
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
