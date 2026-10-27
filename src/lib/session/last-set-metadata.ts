/**
 * Extract last set metadata from exercises.
 * 
 * Shared by finish-session and abandon-session for stale duration calculation.
 */

export type SetForLastSet = {
  completed_at: string | null;
  is_warmup_set: boolean;
};

export type ExerciseForLastSet = {
  rest_seconds: number | null;
  session_sets: SetForLastSet[] | null;
};

export type LastSetMetadata = {
  workingSetCount: number;
  lastSetCompletedAt: string | null;
  lastSetRestSeconds: number | null;
};

/**
 * Find the last logged set timestamp and count working sets.
 * 
 * Used by both finish and abandon for stale duration calculation.
 * Warmup sets are excluded from working set count but included in timestamp search.
 */
export function extractLastSetMetadata(exercises: ExerciseForLastSet[]): LastSetMetadata {
  let workingSetCount = 0;
  let lastSetCompletedAt: string | null = null;
  let lastSetRestSeconds: number | null = null;

  for (const exercise of exercises) {
    for (const set of exercise.session_sets ?? []) {
      if (!set.is_warmup_set) {
        workingSetCount++;
      }
      if (set.completed_at && (!lastSetCompletedAt || set.completed_at > lastSetCompletedAt)) {
        lastSetCompletedAt = set.completed_at;
        lastSetRestSeconds = exercise.rest_seconds;
      }
    }
  }

  return {
    workingSetCount,
    lastSetCompletedAt,
    lastSetRestSeconds,
  };
}
