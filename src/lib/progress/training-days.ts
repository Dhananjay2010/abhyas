import type { Database } from "@/lib/database.types";
import { countWorkingSets } from "@/lib/session/count-sets";

export type SessionType = Database["public"]["Enums"]["day_type"];

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
 * Determine if a session counts toward training streaks and "days trained".
 *
 * SINGLE SOURCE OF TRUTH for streak and training day logic.
 *
 * Rules (product rule 2026-10-24):
 * - Strength (weights/bodyweight): counts ONLY when status = 'completed' AND workingSetCount >= 1
 * - Yoga: counts when status = 'completed'
 * - Breathing/meditation: NEVER counts
 * - Rest/recovery: NEVER counts
 * - 'skipped' status: NEVER counts (regardless of type)
 * - Legacy 'completed' strength with 0 sets: NEVER counts
 *
 * @param sessionType - The session type
 * @param status - The session status ('completed', 'skipped', 'planned', etc.)
 * @param workingSetCount - Number of working sets (required for strength sessions)
 * @returns true if the session counts toward streak/training-days
 */
export function countsTowardStreak(
  sessionType: SessionType | null,
  status: string | null,
  workingSetCount?: number
): boolean {
  if (!sessionType) return false;

  // Only 'completed' sessions can count (skipped, planned, in_progress never count)
  if (status !== "completed") return false;

  // Yoga counts when completed
  if (sessionType === "yoga") return true;

  // Breathing/rest/recovery never count
  if (sessionType === "rest" || sessionType === "active_recovery" || sessionType === "meditation") {
    return false;
  }

  // Strength sessions (weights/bodyweight) must have working sets (AND logic)
  if (sessionType === "weights" || sessionType === "bodyweight") {
    return workingSetCount !== undefined && workingSetCount >= 1;
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
