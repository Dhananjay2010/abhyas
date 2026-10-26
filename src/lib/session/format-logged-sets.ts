/**
 * Format actual logged working sets for display.
 *
 * FIX (c): "What you did" showed targets ('5 × 8–12') instead of what was
 * actually lifted. This formats the logged sets per exercise.
 *
 * Examples:
 * - '10, 10, 9, 8, 8 × 80 kg' when weight is the same
 * - '10 × 80 kg, 10 × 80 kg, 9 × 77.5 kg' when weight varies
 * - '12, 11, 10, 10' for bodyweight (no weight shown)
 * - '45s, 42s, 40s' for timed exercises
 *
 * Respects the user's unit preference (kg or lb display from #102).
 * Skip warm-up sets.
 */

import { formatWeight, type UnitsPreference } from "@/lib/units";

export type LoggedSet = {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  isWarmupSet: boolean;
};

/**
 * Format the working sets for one exercise.
 *
 * Each set's value is its reps (or "45s" for a timed set). A set's weight is
 * shown only when it has one (> 0):
 * - no set weighted: '12, 11, 10' / '45s, 42s'
 * - every set at the same weight: '10, 10, 9 × 80 kg' / '45s, 40s × 10 kg'
 * - otherwise per set, an unweighted set showing its value alone:
 *   '10 × 80 kg, 9 × 77.5 kg' / '10 × 80 kg, 10 × 80 kg, 8'
 * A 0 or blank weight is never folded into a weighted set's figure, and timed
 * sets keep their weight (QA3 LOW-6). Weights go through the shared
 * formatWeight in the user's units.
 *
 * Returns null if there are no working sets (skipped or warm-up only).
 */
export function formatLoggedSets(
  sets: LoggedSet[],
  metric: "reps" | "seconds",
  units: UnitsPreference,
): string | null {
  const working = sets.filter((s) => !s.isWarmupSet);
  if (working.length === 0) return null;

  const valueOf = (s: LoggedSet): string =>
    metric === "seconds"
      ? s.durationSeconds !== null ? `${s.durationSeconds}s` : "—"
      : s.reps !== null ? String(s.reps) : "—";
  const isWeighted = (s: LoggedSet): s is LoggedSet & { weightKg: number } =>
    s.weightKg !== null && s.weightKg > 0;
  const weight = (kg: number) => formatWeight(kg, units === "imperial" ? "imperial" : "metric");

  // Bodyweight or plain timed: values only
  if (!working.some(isWeighted)) {
    return working.map(valueOf).join(", ");
  }

  // Every set weighted, all at the same weight: '10, 10, 9 × 80 kg'
  const allSameWeight =
    working.every(isWeighted) && working.every((s) => s.weightKg === working[0].weightKg);

  if (allSameWeight) {
    return `${working.map(valueOf).join(", ")} × ${weight(working[0].weightKg as number)}`;
  } else {
    // '10 × 80 kg, 9 × 77.5 kg', with an unweighted set as its value alone
    return working
      .map((s) => (isWeighted(s) ? `${valueOf(s)} × ${weight(s.weightKg)}` : valueOf(s)))
      .join(", ");
  }
}
