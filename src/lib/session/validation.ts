/**
 * Rules for a logged set, shared by the runner and the server action.
 *
 * Lives outside `session/actions.ts` because that file is `"use server"`, and
 * such a module may only export async functions — a plain validator exported
 * from there fails the build. Keeping it here is what lets the same rule run
 * in the input, so the button explains itself before a round trip, and again
 * on the server, which is the copy that actually protects the database.
 */

import type { UnitsPreference } from "../units";
import { formatLoad } from "../units";

/**
 * Deliberately generous: the point is to reject what cannot be a set, not to
 * police anyone's training. 500 kg is above the heaviest lift ever recorded and
 * 100 reps covers any sane high-rep set. What they exclude is the damage — a
 * negative weight, a zero-rep "set", and a fat-fingered rep count.
 */
export const MAX_REPS = 100;
export const MAX_WEIGHT_KG = 500;

/**
 * A hold is measured in seconds, and the generous bound is an hour.
 *
 * The column allows a day (86400) because it is also the session duration's
 * unit; nobody planks for an hour, but rejecting at an hour still only
 * excludes what cannot be a set.
 */
export const MAX_HOLD_SECONDS = 3600;

/**
 * Returns a message explaining what is wrong, or null when the set is fine.
 *
 * All three fields may be null together: with per-set logging switched off the
 * runner records that a set happened without asking for numbers. A timed
 * exercise sends `durationSeconds` and leaves `reps` null; everything else
 * does the opposite.
 *
 * Zero reps is rejected rather than stored. It is not a set, and storing it did
 * real harm: `evaluateProgression` counts only sets with reps > 0, so a stray
 * zero made a completed exercise look like a missed one, and two of those in a
 * row drop the working weight by ten percent.
 *
 * @param units - User's units preference for formatting error messages
 */
export function validateSet(
  reps: number | null,
  weightKg: number | null,
  durationSeconds: number | null = null,
  units: UnitsPreference = "metric",
): string | null {
  if (durationSeconds !== null) {
    if (!Number.isInteger(durationSeconds)) return "Seconds must be a whole number.";
    if (durationSeconds < 1) return "A hold needs at least one second. Skip the set instead.";
    if (durationSeconds > MAX_HOLD_SECONDS) {
      return `That is more than ${MAX_HOLD_SECONDS / 60} minutes — please check.`;
    }
  }
  if (reps !== null) {
    if (!Number.isInteger(reps)) return "Reps must be a whole number.";
    if (reps < 1) return "A set needs at least one rep. Skip the set instead.";
    if (reps > MAX_REPS) return `That is more than ${MAX_REPS} reps — please check.`;
  }
  if (weightKg !== null) {
    if (!Number.isFinite(weightKg)) return "That weight does not look right.";
    if (weightKg < 0) return "Weight cannot be negative.";
    if (weightKg > MAX_WEIGHT_KG) {
      const maxFormatted = formatLoad(MAX_WEIGHT_KG, units);
      return `Weight should be ${maxFormatted} or less.`;
    }
  }
  return null;
}
