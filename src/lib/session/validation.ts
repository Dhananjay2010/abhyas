/**
 * Rules for a logged set, shared by the runner and the server action.
 *
 * Lives outside `session/actions.ts` because that file is `"use server"`, and
 * such a module may only export async functions — a plain validator exported
 * from there fails the build. Keeping it here is what lets the same rule run
 * in the input, so the button explains itself before a round trip, and again
 * on the server, which is the copy that actually protects the database.
 */

/**
 * Deliberately generous: the point is to reject what cannot be a set, not to
 * police anyone's training. 500 kg is above the heaviest lift ever recorded and
 * 100 reps covers any sane high-rep set. What they exclude is the damage — a
 * negative weight, a zero-rep "set", and a fat-fingered rep count.
 */
export const MAX_REPS = 100;
export const MAX_WEIGHT_KG = 500;

/**
 * Returns a message explaining what is wrong, or null when the set is fine.
 *
 * Both fields may be null together: with per-set logging switched off the
 * runner records that a set happened without asking for numbers.
 *
 * Zero reps is rejected rather than stored. It is not a set, and storing it did
 * real harm: `evaluateProgression` counts only sets with reps > 0, so a stray
 * zero made a completed exercise look like a missed one, and two of those in a
 * row drop the working weight by ten percent.
 */
export function validateSet(reps: number | null, weightKg: number | null): string | null {
  if (reps !== null) {
    if (!Number.isInteger(reps)) return "Reps must be a whole number.";
    if (reps < 1) return "A set needs at least one rep. Skip the set instead.";
    if (reps > MAX_REPS) return `That is more than ${MAX_REPS} reps — please check.`;
  }
  if (weightKg !== null) {
    if (!Number.isFinite(weightKg)) return "That weight does not look right.";
    if (weightKg < 0) return "Weight cannot be negative.";
    if (weightKg > MAX_WEIGHT_KG) return `Weight should be ${MAX_WEIGHT_KG} kg or less.`;
  }
  return null;
}
