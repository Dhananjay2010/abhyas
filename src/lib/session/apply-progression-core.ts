import type { Database } from "@/lib/database.types";
import { evaluateProgression, type Decision } from "@/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "./build-progression-input";
import { writeExerciseProgressCore, type ProgressClient } from "./write-progress";

type SetFeel = Database["public"]["Enums"]["set_feel"];

/**
 * Apply progression logic: build input, evaluate, and persist.
 * 
 * Extracted from src/app/session/actions.ts applyProgression for testing.
 * This is the core progression flow that must pass:
 * - feel parameter through to buildProgressionInput
 * - decision.nextWorkingWeightKg to writeExerciseProgressCore
 */
export async function applyProgressionCore(
  client: ProgressClient,
  userId: string,
  exerciseId: string,
  sessionExercise: SessionExerciseRow,
  sets: SessionSetRow[],
  progress: ExerciseProgressRow,
  session: SessionRow,
  feel: SetFeel | null,
): Promise<Decision> {
  const totalSessions = progress?.total_sessions ?? 0;

  const decision = evaluateProgression(
    buildProgressionInput(
      sessionExercise,
      sets,
      progress,
      session,
      feel
    )
  );

  await writeExerciseProgressCore(
    client,
    userId,
    exerciseId,
    decision,
    totalSessions,
    session.local_date,
  );

  return decision;
}
