/**
 * Unique key for a set logging form, preventing React from reusing stale state
 * when the exercise changes mid-session (e.g., during a swap).
 *
 * Including exerciseId ensures that swapping exercises creates a fresh form
 * component, clearing any typed weight/reps from the previous exercise.
 */
export function setFormKey(sessionExerciseId: string, exerciseId: string, setNumber: number): string {
  return `${sessionExerciseId}:${exerciseId}:${setNumber}`;
}
