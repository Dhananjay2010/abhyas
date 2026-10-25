/**
 * Pure reducer for handling set conflict resolution in the session runner.
 * Extracted for testability.
 */

export type LoggedSet = {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

export type ExerciseForConflict = {
  id: string;
  sets: LoggedSet[];
  plannedSets: number;
  status: "pending" | "completed" | "skipped" | "swapped_out";
};

export type ConflictResult = {
  ok: false;
  reason: "set_exists";
  savedSets: LoggedSet[];
};

export type ConflictResolution<T extends ExerciseForConflict> = {
  exercises: T[];
  nextExerciseIndex: number;
  message: string;
};

/**
 * Apply conflict result to exercises state and determine next exercise index.
 * 
 * - Replaces the current exercise's sets with the server's savedSets
 * - Finds the next unfinished exercise at or after the current index
 * - Returns user-facing message
 * 
 * Generic over exercise type to work with both test and production types.
 */
export function resolveSetConflict<T extends ExerciseForConflict>(
  exercises: T[],
  currentExerciseId: string,
  currentExerciseIndex: number,
  conflict: ConflictResult,
): ConflictResolution<T> {
  // Update exercise sets with server's saved sets
  const updatedExercises = exercises.map((e) =>
    e.id === currentExerciseId ? ({ ...e, sets: conflict.savedSets } as T) : e,
  );

  // Find the current exercise after the update
  const currentExercise = updatedExercises[currentExerciseIndex];

  // If the current exercise is now complete (all sets done), stay on it to show
  // the feel prompt. Previously this jumped to the next exercise, which skipped
  // the feel and left the exercise pending.
  if (currentExercise && currentExercise.sets.length >= currentExercise.plannedSets) {
    return {
      exercises: updatedExercises,
      nextExerciseIndex: currentExerciseIndex,
      message: "That set was already saved. Showing your latest sets.",
    };
  }

  // Find next unfinished exercise (pending and not fully logged)
  const nextUnfinishedIndex = updatedExercises.findIndex(
    (e, i) => i >= currentExerciseIndex && e.status === "pending" && e.sets.length < e.plannedSets,
  );

  // If found and different from current, advance to it; otherwise stay on current
  const nextIndex =
    nextUnfinishedIndex !== -1 && nextUnfinishedIndex !== currentExerciseIndex
      ? nextUnfinishedIndex
      : currentExerciseIndex;

  return {
    exercises: updatedExercises,
    nextExerciseIndex: nextIndex,
    message: "That set was already saved. Showing your latest sets.",
  };
}
