/**
 * Pure calculation functions for exercise performance analysis.
 * 
 * These functions are separate from database queries to make them
 * easy to unit test and reason about.
 */

import { computeE1rm, roundToStoragePrecision } from "@/lib/program/progression";

export interface SetData {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
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
      const bestE1rm = computeE1rm(best.weight_kg, best.reps) ?? 0;
      const currentE1rm = computeE1rm(current.weight_kg, current.reps) ?? 0;
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
 * Find the baseline set for rep PR comparison.
 * 
 * For weighted exercises, the baseline is the first session's set with:
 * 1. Highest weight
 * 2. Then most reps (if weights are equal)
 * 3. Then earliest in chronological order
 * 
 * This is NOT the highest e1RM. Example: [100×3, 90×10] baseline is 100×3,
 * even though 90×10 has higher e1RM (120 vs 110).
 * 
 * @param sets - Array of sets from the first session
 * @returns The baseline set, or null if empty
 */
function findBaselineSet(sets: SetData[]): SetData | null {
  if (sets.length === 0) return null;
  
  return sets.reduce((best, current) => {
    const bestWeight = best.weight_kg ?? 0;
    const currentWeight = current.weight_kg ?? 0;
    
    // Highest weight wins
    if (currentWeight > bestWeight) return current;
    if (currentWeight < bestWeight) return best;
    
    // Weights equal: most reps wins
    const bestReps = best.reps ?? 0;
    const currentReps = current.reps ?? 0;
    if (currentReps > bestReps) return current;
    
    // If equal on both, keep the first (earliest)
    return best;
  });
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
  // L2: Treat null and 0 weight as bodyweight explicitly
  const weightedSets = allSets.filter(s => s.weight_kg !== null && s.weight_kg > 0);
  const bodyweightSets = allSets.filter(s => s.weight_kg === null || s.weight_kg === 0);
  const hasWeight = weightedSets.length > 0;

  if (hasWeight) {
    // Weighted exercise PRs
    
    // 1. Heaviest weight (at any reps) - round before comparison
    const heaviestSet = weightedSets.reduce((best, current) => {
      const bestWeight = roundToStoragePrecision(best.weight_kg ?? 0);
      const currentWeight = roundToStoragePrecision(current.weight_kg ?? 0);
      return currentWeight > bestWeight ? current : best;
    });
    
    const roundedHeaviest = roundToStoragePrecision(heaviestSet.weight_kg ?? 0);
    if (roundedHeaviest > 0) {
      const e1rm = computeE1rm(heaviestSet.weight_kg, heaviestSet.reps);
      records.push({
        type: "heaviest_weight",
        set: heaviestSet,
        value: roundedHeaviest,
        e1rm: e1rm ?? undefined,
      });
    }

    // 2. Best estimated 1RM
    const bestE1rmSet = weightedSets.reduce((best, current) => {
      const bestE1rm = computeE1rm(best.weight_kg, best.reps) ?? 0;
      const currentE1rm = computeE1rm(current.weight_kg, current.reps) ?? 0;
      return currentE1rm > bestE1rm ? current : best;
    });
    
    const bestE1rm = computeE1rm(bestE1rmSet.weight_kg, bestE1rmSet.reps);
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
  // For mixed histories (bodyweight then weighted), track both separately
  
  if (hasWeight && weightedSets.length > 0) {
    // Weighted rep PR logic
    // Find all weighted sets before the first weighted rep PR
    let firstWeightedRepPRIndex = -1;
    for (let i = 1; i < weightedSets.length; i++) {
      const currentSet = weightedSets[i];
      const earlierWeightedSets = weightedSets.slice(0, i);
      if (checkWeightedRepPR(currentSet, earlierWeightedSets)) {
        firstWeightedRepPRIndex = i;
        break;
      }
    }

    // Baseline: set from before any weighted rep PRs occurred
    // Order: highest weight, then most reps, then earliest
    let bestRepPRSet: SetData | null;
    if (firstWeightedRepPRIndex === -1) {
      // No weighted rep PRs found - use first weighted set as baseline
      bestRepPRSet = weightedSets[0] ?? null;
    } else if (firstWeightedRepPRIndex === 1) {
      // First weighted rep PR is at index 1, so only weightedSets[0] is baseline
      bestRepPRSet = weightedSets[0] ?? null;
    } else {
      // Multiple weighted sets before first rep PR - find baseline
      // Order: highest weight, then most reps, then earliest
      const baselineSets = weightedSets.slice(0, firstWeightedRepPRIndex);
      bestRepPRSet = findBaselineSet(baselineSets);
    }

    // Process remaining weighted sets to find rep PRs (last one wins)
    for (let i = Math.max(1, firstWeightedRepPRIndex); i < weightedSets.length; i++) {
      const currentSet = weightedSets[i];
      const earlierWeightedSets = weightedSets.slice(0, i);
      
      if (checkWeightedRepPR(currentSet, earlierWeightedSets)) {
        bestRepPRSet = currentSet;
      }
    }

    // If there are also bodyweight sets, check if they have a higher rep count
    // Bodyweight records are kept if they beat weighted records on reps alone
    if (bodyweightSets.length > 0) {
      const bodyweightBest = bodyweightSets.reduce((best, current) => {
        const bestReps = best.reps ?? 0;
        const currentReps = current.reps ?? 0;
        return currentReps > bestReps ? current : best;
      });
      const bodyweightBestReps = bodyweightBest.reps ?? 0;
      const weightedBestReps = bestRepPRSet?.reps ?? 0;
      
      // Bodyweight wins if it has more reps
      if (bodyweightBestReps > weightedBestReps) {
        bestRepPRSet = bodyweightBest;
      }
    }

    if (bestRepPRSet && (bestRepPRSet.reps ?? 0) > 0) {
      const e1rm = computeE1rm(bestRepPRSet.weight_kg, bestRepPRSet.reps) ?? undefined;
      records.push({
        type: "most_reps",
        set: bestRepPRSet,
        value: bestRepPRSet.reps!,
        e1rm,
      });
    }
  } else if (bodyweightSets.length > 0) {
    // Pure bodyweight: plain most-reps
    const mostRepsSet = bodyweightSets.reduce((best, current) => {
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
