/**
 * Pick the top set from a list of working sets.
 * 
 * Rules:
 * - Only working sets (is_warmup_set = false)
 * - Heaviest weight wins
 * - Ties broken by most reps
 * 
 * Returns the weight_kg of the top set, or null if no valid sets.
 */

type WorkingSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean | null;
};

export function pickTopSet(sets: WorkingSet[]): number | null {
  // Filter to working sets only with valid weight
  const workingSets = sets.filter(
    (s) =>
      s.is_warmup_set === false &&
      s.weight_kg !== null &&
      s.weight_kg > 0
  );

  if (workingSets.length === 0) return null;

  // Sort by weight DESC, then reps DESC
  const sorted = workingSets.slice().sort((a, b) => {
    const weightDiff = (b.weight_kg ?? 0) - (a.weight_kg ?? 0);
    if (weightDiff !== 0) return weightDiff;
    // Ties broken by reps
    return (b.reps ?? 0) - (a.reps ?? 0);
  });

  return sorted[0].weight_kg;
}
