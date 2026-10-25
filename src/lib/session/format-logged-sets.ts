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
 * Returns null if there are no working sets (skipped or warm-up only).
 */
export function formatLoggedSets(
  sets: LoggedSet[],
  metric: "reps" | "seconds",
  units: UnitsPreference,
): string | null {
  const working = sets.filter((s) => !s.isWarmupSet);
  if (working.length === 0) return null;

  // Timed exercises: show seconds only
  if (metric === "seconds") {
    const seconds = working
      .map((s) => (s.durationSeconds !== null ? `${s.durationSeconds}s` : "—"))
      .join(", ");
    return seconds;
  }

  // Bodyweight: show reps only
  const hasWeight = working.some((s) => s.weightKg !== null && s.weightKg > 0);
  if (!hasWeight) {
    const reps = working.map((s) => (s.reps !== null ? String(s.reps) : "—")).join(", ");
    return reps;
  }

  // Weighted: check if all sets used the same weight
  const weights = working.map((s) => s.weightKg).filter((w): w is number => w !== null);
  const allSameWeight = weights.length > 0 && weights.every((w) => w === weights[0]);

  if (allSameWeight) {
    // '10, 10, 9, 8, 8 × 80 kg'
    const reps = working.map((s) => (s.reps !== null ? String(s.reps) : "—")).join(", ");
    const weight = formatWeight(weights[0], units === "imperial" ? "imperial" : "metric");
    return `${reps} × ${weight}`;
  } else {
    // '10 × 80 kg, 10 × 80 kg, 9 × 77.5 kg'
    const formatted = working
      .map((s) => {
        const reps = s.reps !== null ? String(s.reps) : "—";
        const weight =
          s.weightKg !== null
            ? formatWeight(s.weightKg, units === "imperial" ? "imperial" : "metric")
            : "—";
        return `${reps} × ${weight}`;
      })
      .join(", ");
    return formatted;
  }
}
