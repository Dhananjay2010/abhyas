import { buildRunnerExercise, type SessionExerciseInput, type ProgressInput } from "./build-runner-exercises";

/**
 * Map session exercise rows to RunnerExercise objects, attaching previous completed weights.
 * 
 * Exported for testing (Mutant I: page.tsx must pass previousCompletedWeightKg from loader).
 * 
 * @param rows Session exercise rows from Supabase query
 * @param progressByExercise Map of exercise_id to progress data
 * @param previousWeightByExercise Map of exercise_id to previous completed weight (from loader)
 * @param remembersWeights Whether the user's planning mode remembers weights
 * @param isDeload Whether this is a deload session
 * @returns Array of RunnerExercise objects
 */
export function buildRunnerExercisesWithPreviousWeights({
  rows,
  progressByExercise,
  previousWeightByExercise,
  remembersWeights,
  isDeload,
}: {
  rows: readonly SessionExerciseInput[];
  progressByExercise: Map<string, ProgressInput>;
  previousWeightByExercise: Map<string, number>;
  remembersWeights: boolean;
  isDeload: boolean;
}) {
  return rows.map((r) => {
    const progress = remembersWeights ? progressByExercise.get(r.exercises?.id ?? "") : undefined;
    const previousWeight = previousWeightByExercise.get(r.exercises?.id ?? "");
    
    return buildRunnerExercise({
      row: r,
      progress: progress ? { 
        ...progress, 
        // M1: Use actual logged weight from last completed session
        previous_completed_weight_kg: previousWeight ?? null
      } : undefined,
      remembersWeights,
      isDeload,
    });
  });
}
