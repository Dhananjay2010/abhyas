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
 * Formula: weight × (1 + reps/30)
 * 
 * Notes:
 * - Returns the weight itself when reps = 1 (no estimation needed)
 * - Returns null for bodyweight (weight = 0 or null) or missing reps
 * - Only meaningful for weighted reps-based exercises
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
  
  return weightKg * (1 + reps / 30);
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
      const bestE1rm = calculateEpley1RM(best.reps, best.weight_kg) ?? 0;
      const currentE1rm = calculateEpley1RM(current.reps, current.weight_kg) ?? 0;
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

  // Most reps (tracked for both weighted and bodyweight)
  const mostRepsSet = allSets.reduce((best, current) => {
    const bestReps = best.reps ?? 0;
    const currentReps = current.reps ?? 0;
    return currentReps > bestReps ? current : best;
  });
  
  if ((mostRepsSet.reps ?? 0) > 0) {
    const e1rm = hasWeight 
      ? calculateEpley1RM(mostRepsSet.reps, mostRepsSet.weight_kg) ?? undefined
      : undefined;
    
    records.push({
      type: "most_reps",
      set: mostRepsSet,
      value: mostRepsSet.reps!,
      e1rm,
    });
  }

  return records;
}

/**
 * Check if a set achieves any new PRs compared to all previous sets.
 * 
 * This allows showing PR badges in real-time as sets are logged.
 * Pass all sets up to and including the one being checked, in chronological order.
 * 
 * @param sets - All sets up to and including the one to check, chronological
 * @param setIndex - Index of the set to check (0-based)
 * @param metric - Exercise metric
 * @returns Array of PR types achieved by this set
 */
export function detectSetPRs(
  sets: SetData[],
  setIndex: number,
  metric: "reps" | "seconds"
): PRType[] {
  if (setIndex < 0 || setIndex >= sets.length) return [];
  
  const currentSet = sets[setIndex];
  const previousSets = sets.slice(0, setIndex);
  
  // If no previous sets, this is the first - everything is a PR
  if (previousSets.length === 0) {
    const prs: PRType[] = [];
    
    if (metric === "seconds") {
      if ((currentSet.duration_seconds ?? 0) > 0) {
        prs.push("longest_duration");
      }
    } else {
      const hasWeight = (currentSet.weight_kg ?? 0) > 0;
      if (hasWeight) {
        prs.push("heaviest_weight", "best_e1rm");
      }
      if ((currentSet.reps ?? 0) > 0) {
        prs.push("most_reps");
      }
    }
    
    return prs;
  }

  const prs: PRType[] = [];
  const previousRecords = detectPersonalRecords(previousSets, metric);
  
  if (metric === "seconds") {
    const currentDuration = currentSet.duration_seconds ?? 0;
    const prevLongest = previousRecords.find(pr => pr.type === "longest_duration");
    
    if (currentDuration > 0 && currentDuration > (prevLongest?.value ?? 0)) {
      prs.push("longest_duration");
    }
    
    return prs;
  }

  // Reps-based PRs
  const currentReps = currentSet.reps ?? 0;
  const currentWeight = currentSet.weight_kg ?? 0;
  const currentE1rm = calculateEpley1RM(currentSet.reps, currentSet.weight_kg) ?? 0;
  
  const hasWeight = currentWeight > 0;
  
  if (hasWeight) {
    const prevHeaviest = previousRecords.find(pr => pr.type === "heaviest_weight");
    if (currentWeight > (prevHeaviest?.value ?? 0)) {
      prs.push("heaviest_weight");
    }
    
    const prevBestE1rm = previousRecords.find(pr => pr.type === "best_e1rm");
    if (currentE1rm > (prevBestE1rm?.value ?? 0)) {
      prs.push("best_e1rm");
    }
  }
  
  const prevMostReps = previousRecords.find(pr => pr.type === "most_reps");
  if (currentReps > (prevMostReps?.value ?? 0)) {
    prs.push("most_reps");
  }

  return prs;
}
