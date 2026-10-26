/**
 * Pure function to apply a swap result to the exercises state.
 * Exported for testing (MEDIUM-1).
 */

import type { SwapResult } from "@/app/session/actions";

export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  metric: string;
  repsMin: number | null;
  repsMax: number | null;
  suggestedWeightKg: number | null;
  workingWeightKg: number | null;
  isBodyweight: boolean;
  [key: string]: unknown;
};

/**
 * Apply a swap result to the exercises array, updating the swapped exercise
 * with the new exercise's data including exerciseId, weights, and prescription.
 * 
 * @param exercises - Current exercises array
 * @param sessionExerciseId - The session_exercise id that was swapped
 * @param swapResult - The swap result from the server
 * @returns New exercises array with the swap applied
 */
export function applySwapResult(
  exercises: SessionExercise[],
  sessionExerciseId: string,
  swapResult: SwapResult & { exerciseId: string; name: string; cue: string | null },
): SessionExercise[] {
  return exercises.map((e) =>
    e.id === sessionExerciseId
      ? {
          ...e,
          name: swapResult.name,
          cue: swapResult.cue,
          exerciseId: swapResult.exerciseId,
          metric: swapResult.metric,
          repsMin: swapResult.repsMin ?? e.repsMin,
          repsMax: swapResult.repsMax ?? e.repsMax,
          suggestedWeightKg: swapResult.weightPrefill,
          workingWeightKg: swapResult.workingWeightKg,
          isBodyweight: swapResult.isBodyweight,
        }
      : e,
  );
}
