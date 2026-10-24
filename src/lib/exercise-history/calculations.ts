/**
 * Pure calculation functions for exercise performance analysis.
 * 
 * These functions are separate from database queries to make them
 * easy to unit test and reason about.
 */

export interface SetData {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
}

/**
 * Calculate estimated 1RM using the Epley formula.
 * 
 * Formula: weight × (1 + LEAST(reps, 12)/30)
 * 
 * Reps are capped at 12 because the formula becomes unreliable on high-rep sets.
 * This matches the formula used in exercise_strength_history (Progress view).
 * 
 * Notes:
 * - Returns the weight itself when reps = 1 (no estimation needed)
 * - Returns null for bodyweight (weight = 0 or null) or missing reps
 * - Only meaningful for weighted reps-based exercises
 * - Example: 40 kg × 20 reps = 40 × (1 + 12/30) = 56 kg
 * 
 * @param reps - Number of reps performed
 * @param weightKg - Weight used in kg
 * @returns Estimated 1RM in kg, or null if not applicable
 */
export function calculateEpley1RM(
  reps: number | null,
  weightKg: number | null
): number | null {
  if (reps === null || reps < 1) return null;
  if (weightKg === null || weightKg <= 0) return null;
  
  // When reps = 1, that IS the 1RM (no estimation needed)
  if (reps === 1) return weightKg;
  
  // Cap reps at 12 for reliability (matches exercise_strength_history)
  const cappedReps = Math.min(reps, 12);
  
  return weightKg * (1 + cappedReps / 30);
}

/**
 * Check if a set achieves a rep PR for weighted exercises.
 * 
 * For a working set at weight w with r reps to be a rep PR:
 * (a) There must be at least one earlier working set at exactly w, AND
 * (b) r must be greater than the reps of EVERY earlier working set at weight >= w
 * 
 * Both conditions must hold. Deload sessions will be excluded later through
 * the deload flag, not by this function.
 * 
 * Examples:
 * - 100×5, then 80×8, then 80×9: 80×9 IS a PR (beats 80×8 at same weight, and 9 > 5)
 * - 100×5, then 110×3: NOT a PR (no earlier set at 110)
 * - 100×5, then 100×5: NOT a PR (tie, not greater)
 * 
 * @param currentSet - The set to check
 * @param earlierSets - All sets that came before chronologically
 * @returns true if this set is a rep PR, false otherwise
 */
export function checkWeightedRepPR(
  currentSet: SetData,
  earlierSets: SetData[]
): boolean {
  const currentReps = currentSet.reps ?? 0;
  const currentWeight = currentSet.weight_kg ?? 0;
  
  if (currentReps === 0) return false;

  // (a) Must have at least one earlier set at exactly this weight
  let hasEarlierSetAtWeight = false;
  for (const earlierSet of earlierSets) {
    if (earlierSet.weight_kg === currentWeight) {
      hasEarlierSetAtWeight = true;
      break;
    }
  }
  
  if (!hasEarlierSetAtWeight) return false;

  // (b) Current reps must beat ALL earlier sets at weight >= current weight
  for (const earlierSet of earlierSets) {
    const earlierWeight = earlierSet.weight_kg ?? 0;
    const earlierReps = earlierSet.reps ?? 0;
    
    if (earlierWeight >= currentWeight && earlierReps >= currentReps) {
      return false; // Found an earlier set at >= weight with >= reps
    }
  }

  return true;
}

/**
 * Round e1RM value to 0.1 kg to avoid float precision issues in comparisons.
 * Used for tie detection: 121×1 and 110×3 both round to 121.0, so no PR.
 * 
 * @param e1rm - Estimated 1RM or null
 * @returns Rounded e1RM or 0 if null
 */
export function roundE1RM(e1rm: number | null): number {
  if (e1rm === null) return 0;
  return Math.round(e1rm * 10) / 10;
}

/**
 * Calculate total volume for a set (reps × weight).
 * Returns 0 for bodyweight or time-based exercises.
 */
export function calculateSetVolume(set: SetData): number {
  const reps = set.reps ?? 0;
  const weight = set.weight_kg ?? 0;
  return reps * weight;
}

/**
 * Find the top set from a list of sets.
 * 
 * For weighted exercises: the set with highest estimated 1RM.
 * For bodyweight exercises: the set with most reps.
 * For time-based exercises: the set with longest duration.
 * 
 * @param sets - Array of sets to analyze
 * @param metric - Exercise metric ("reps" or "seconds")
 * @returns The top set, or null if no valid sets
 */
export function findTopSet(
  sets: SetData[],
  metric: "reps" | "seconds"
): SetData | null {
  if (sets.length === 0) return null;

  if (metric === "seconds") {
    // For time-based: longest duration
    return sets.reduce((best, current) => {
      const bestDuration = best.duration_seconds ?? 0;
      const currentDuration = current.duration_seconds ?? 0;
      return currentDuration > bestDuration ? current : best;
    });
  }

  // For reps-based exercises
  const hasWeight = sets.some(s => (s.weight_kg ?? 0) > 0);
  
  if (hasWeight) {
    // Weighted: highest estimated 1RM
    return sets.reduce((best, current) => {
      const bestE1rm = calculateEpley1RM(best.reps, best.weight_kg) ?? 0;
      const currentE1rm = calculateEpley1RM(current.reps, current.weight_kg) ?? 0;
      return currentE1rm > bestE1rm ? current : best;
    });
  } else {
    // Bodyweight: most reps
    return sets.reduce((best, current) => {
      const bestReps = best.reps ?? 0;
      const currentReps = current.reps ?? 0;
      return currentReps > bestReps ? current : best;
    });
  }
}

/**
 * Personal record types that can be tracked.
 */
export type PRType = 
  | "heaviest_weight"     // Highest weight lifted (any reps)
  | "most_reps"           // Most reps in a single set (at any weight)
  | "best_e1rm"           // Best estimated 1RM
  | "longest_duration";   // Longest duration (for time-based)

/**
 * A personal record achievement.
 */
export interface PersonalRecord {
  type: PRType;
  set: SetData;
  value: number; // The PR value (weight in kg, reps count, or seconds)
  /** Estimated 1RM when applicable */
  e1rm?: number;
}

/**
 * Detect all current personal records from a complete exercise history.
 * 
 * For weighted exercises:
 * - Heaviest weight (any reps)
 * - Most reps at any weight
 * - Best estimated 1RM
 * 
 * For bodyweight exercises:
 * - Most reps
 * 
 * For time-based exercises:
 * - Longest duration
 * 
 * @param allSets - All sets for this exercise across all sessions, chronological
 * @param metric - Exercise metric
 * @returns Array of current PRs (can be empty for a new exercise)
 */
export function detectPersonalRecords(
  allSets: SetData[],
  metric: "reps" | "seconds"
): PersonalRecord[] {
  if (allSets.length === 0) return [];

  const records: PersonalRecord[] = [];

  if (metric === "seconds") {
    // Time-based: only track longest duration
    const longestSet = allSets.reduce((best, current) => {
      const bestDuration = best.duration_seconds ?? 0;
      const currentDuration = current.duration_seconds ?? 0;
      return currentDuration > bestDuration ? current : best;
    });
    
    if ((longestSet.duration_seconds ?? 0) > 0) {
      records.push({
        type: "longest_duration",
        set: longestSet,
        value: longestSet.duration_seconds!,
      });
    }
    
    return records;
  }

  // Reps-based exercises
  const hasWeight = allSets.some(s => (s.weight_kg ?? 0) > 0);

  if (hasWeight) {
    // Weighted exercise PRs
    
    // 1. Heaviest weight (at any reps)
    const heaviestSet = allSets.reduce((best, current) => {
      const bestWeight = best.weight_kg ?? 0;
      const currentWeight = current.weight_kg ?? 0;
      return currentWeight > bestWeight ? current : best;
    });
    
    if ((heaviestSet.weight_kg ?? 0) > 0) {
      const e1rm = calculateEpley1RM(heaviestSet.reps, heaviestSet.weight_kg);
      records.push({
        type: "heaviest_weight",
        set: heaviestSet,
        value: heaviestSet.weight_kg!,
        e1rm: e1rm ?? undefined,
      });
    }

    // 2. Best estimated 1RM
    const bestE1rmSet = allSets.reduce((best, current) => {
      const bestE1rm = roundE1RM(calculateEpley1RM(best.reps, best.weight_kg));
      const currentE1rm = roundE1RM(calculateEpley1RM(current.reps, current.weight_kg));
      return currentE1rm > bestE1rm ? current : best;
    });
    
    const bestE1rm = calculateEpley1RM(bestE1rmSet.reps, bestE1rmSet.weight_kg);
    if (bestE1rm !== null && bestE1rm > 0) {
      records.push({
        type: "best_e1rm",
        set: bestE1rmSet,
        value: bestE1rm,
        e1rm: bestE1rm,
      });
    }
  }

  // Most reps: same-weight comparison for weighted, plain for bodyweight
  if (hasWeight) {
    // Weighted: use checkWeightedRepPR helper
    // Find all sets before the first rep PR - these form the "baseline session"
    let firstRepPRIndex = -1;
    for (let i = 1; i < allSets.length; i++) {
      const currentSet = allSets[i];
      const earlierSets = allSets.slice(0, i);
      if (checkWeightedRepPR(currentSet, earlierSets)) {
        firstRepPRIndex = i;
        break;
      }
    }

    // Baseline: top set from before any rep PRs occurred
    let bestRepPRSet: SetData | null;
    if (firstRepPRIndex === -1) {
      // No rep PRs found - use first set as baseline (original behavior)
      // This handles cases like 100×5 / 110×3 where 110 is a new heavier weight (not a rep PR)
      bestRepPRSet = allSets[0] ?? null;
    } else if (firstRepPRIndex === 1) {
      // First rep PR is at index 1, so only allSets[0] is baseline
      bestRepPRSet = allSets[0] ?? null;
    } else {
      // Multiple sets before first rep PR - find the top one (highest e1RM)
      // This is the key fix: use top set from "first session", not just allSets[0]
      const baselineSets = allSets.slice(0, firstRepPRIndex);
      bestRepPRSet = findTopSet(baselineSets, "reps");
    }

    // Process remaining sets to find rep PRs (last one wins)
    for (let i = Math.max(1, firstRepPRIndex); i < allSets.length; i++) {
      const currentSet = allSets[i];
      const earlierSets = allSets.slice(0, i);
      
      if (checkWeightedRepPR(currentSet, earlierSets)) {
        bestRepPRSet = currentSet;
      }
    }

    if (bestRepPRSet && (bestRepPRSet.reps ?? 0) > 0) {
      const e1rm = calculateEpley1RM(bestRepPRSet.reps, bestRepPRSet.weight_kg) ?? undefined;
      records.push({
        type: "most_reps",
        set: bestRepPRSet,
        value: bestRepPRSet.reps!,
        e1rm,
      });
    }
  } else {
    // Bodyweight: plain most-reps
    const mostRepsSet = allSets.reduce((best, current) => {
      const bestReps = best.reps ?? 0;
      const currentReps = current.reps ?? 0;
      return currentReps > bestReps ? current : best;
    });
    
    if ((mostRepsSet.reps ?? 0) > 0) {
      records.push({
        type: "most_reps",
        set: mostRepsSet,
        value: mostRepsSet.reps!,
      });
    }
  }

  return records;
}
