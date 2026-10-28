import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { loadPreviousCompletedWeights } from "./load-previous-weights";
import { buildRunnerExercisesWithPreviousWeights } from "./build-runner-exercises-with-previous-weights";
import type { SessionExerciseInput, ProgressInput } from "./build-runner-exercises";

/**
 * Integrated loader + helper: loads previous weights from DB and builds runner exercises.
 * 
 * Exported for testing page-level wiring (Mutant: page.tsx passing empty map or bypassing helper).
 * 
 * @param client Supabase client
 * @param userId User ID
 * @param rows Session exercise rows
 * @param progressByExercise Progress data map
 * @param remembersWeights Whether the user's planning mode remembers weights
 * @param isDeload Whether this is a deload session
 */
export async function loadAndBuildRunnerExercises({
  client,
  userId,
  rows,
  progressByExercise,
  remembersWeights,
  isDeload,
}: {
  client: SupabaseClient<Database>;
  userId: string;
  rows: readonly SessionExerciseInput[];
  progressByExercise: Map<string, ProgressInput>;
  remembersWeights: boolean;
  isDeload: boolean;
}) {
  const exerciseIds = rows
    .map((r) => r.exercises?.id)
    .filter((id): id is string => typeof id === 'string');

  const previousWeightByExercise = await loadPreviousCompletedWeights(client, userId, exerciseIds);

  return buildRunnerExercisesWithPreviousWeights({
    rows,
    progressByExercise,
    previousWeightByExercise,
    remembersWeights,
    isDeload,
  });
}
