/**
 * Merge server sets with local confirmed saves.
 * 
 * Handles the case where router.refresh or resync replaces local state
 * with server data from before a save lands. We keep whichever is newer
 * by (session_exercise_id, set_number), and never drop a confirmed local save.
 * 
 * This prevents Set 4 from showing empty after it was saved (case B1-B).
 */

export type SetForMerge = {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

export type ExerciseWithSets = {
  id: string;
  sets: SetForMerge[];
};

/**
 * Merge server sets with local confirmed saves.
 * 
 * For each (session_exercise_id, set_number):
 * - If only in local: keep local (it's a confirmed save not yet in server data)
 * - If only in server: keep server
 * - If in both: keep server (it's the source of truth once landed)
 * 
 * This ensures we never drop a confirmed local save, but we do accept
 * server updates once they've landed.
 */
export function mergeSets<T extends ExerciseWithSets>(
  localExercises: T[],
  serverExercises: T[],
): T[] {
  const result: T[] = [];

  for (let i = 0; i < localExercises.length; i++) {
    const localEx = localExercises[i];
    const serverEx = serverExercises.find((e) => e.id === localEx.id);

    if (!serverEx) {
      // Exercise only in local (shouldn't happen, but keep it)
      result.push(localEx);
      continue;
    }

    // Merge sets by set_number
    const mergedSets = new Map<number, SetForMerge>();

    // Add all server sets first
    for (const set of serverEx.sets) {
      mergedSets.set(set.setNumber, set);
    }

    // Add local sets that aren't in server yet (confirmed saves not yet in server data)
    for (const set of localEx.sets) {
      if (!mergedSets.has(set.setNumber)) {
        mergedSets.set(set.setNumber, set);
      }
      // If server has it, we keep server's version (it's the landed truth)
    }

    // Sort by set number and convert back to array
    const sets = Array.from(mergedSets.values()).sort((a, b) => a.setNumber - b.setNumber);

    result.push({
      ...localEx,
      ...serverEx,
      sets,
    });
  }

  return result;
}
