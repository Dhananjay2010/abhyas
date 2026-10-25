/**
 * Core logic for swapping exercises, extracted from actions.ts for testing.
 * 
 * Modeled on start-session-core.ts: takes injected dependencies and returns
 * a result, allowing tests with fakes to verify the call-site wiring (S1, S2, S3).
 */

import type { Database } from "@/lib/database.types";
import type { SwapWeightsResult } from "@/lib/session/resolve-swap-weights";
import { prescribe } from "@/lib/program/prescription";

// Derive types from generated Database schema to prevent drift
type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];
type ExerciseMechanic = Database["public"]["Enums"]["mechanic_type"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type UserGoal = Database["public"]["Enums"]["fitness_goal"] | null;
type ExperienceLevel = Database["public"]["Enums"]["fitness_level"] | null;

export type SwapExerciseDeps = {
  /**
   * Resolve weight prefill and working weight for the swapped-in exercise.
   * 
   * The core passes input.newExerciseId (not the old exercise id) to this,
   * which is what S3 tests.
   */
  resolveSwapWeights: (
    sessionId: string,
    newExerciseId: string,
    equipmentIds: string[],
    metric: ExerciseMetric,
    movementPattern: MovementPattern,
    remembersWeights: boolean,
  ) => Promise<SwapWeightsResult>;
};

export type SwapExerciseCoreInput = {
  newExerciseId: string;
  current: {
    exercise_id: string;
    metric: ExerciseMetric;
    planned_reps_min: number | null;
    planned_reps_max: number | null;
    session_id: string;
  };
  replacement: {
    metric: ExerciseMetric;
    mechanic: ExerciseMechanic | null;
    equipment_ids: string[];
    movement_pattern: MovementPattern;
  } | null;
  profile: {
    goal: UserGoal;
    level: ExperienceLevel;
  } | null;
  remembersWeights: boolean;
};

export type SwapExerciseCoreResult = {
  metric: ExerciseMetric;
  repsMin: number | null;
  repsMax: number | null;
  equipmentIds: string[];
  weightPrefill: number | null;
  workingWeightKg: number | null;
  isBodyweight: boolean;
};

/**
 * Core swap logic with injected dependencies.
 * 
 * Tests can inject fake resolveSwapWeights to verify:
 * - S3: the NEW exercise id is passed, not the old one
 * - S1/S2: weightPrefill and workingWeightKg are returned unchanged
 */
export async function swapExerciseCore(
  deps: SwapExerciseDeps,
  input: SwapExerciseCoreInput,
): Promise<SwapExerciseCoreResult> {
  const { newExerciseId, current, replacement, profile, remembersWeights } = input;
  
  const metric = replacement?.metric ?? "reps";
  const equipmentIds = replacement?.equipment_ids ?? [];

  // Resolve weight prefill and working weight for the swapped-in exercise.
  // This passes input.newExerciseId (not current.exercise_id), which is what S3 tests.
  const { weightPrefill, workingWeightKg, isBodyweight } = await deps.resolveSwapWeights(
    current.session_id,
    newExerciseId,
    equipmentIds,
    metric,
    replacement?.movement_pattern ?? "other",
    remembersWeights,
  );

  /*
    A changed unit needs a changed range. `planned_reps_min/max` are the range
    in the exercise's own metric, so swapping eight-to-twelve reps for a hold
    without re-prescribing would ask for an eight-second plank. The goal's hold
    table is the same one the generator uses, so a swap lands on what the
    planner would have prescribed for that slot.

    Only the range is re-derived. Sets stay as the day dosed them -- including a
    deload week's reduction, which `applyDeload` applies to sets and not to the
    range -- because the swap is a substitution within the session, not a
    re-planning of it.
  */
  const reranged =
    metric !== current.metric && profile?.goal && profile?.level
      ? prescribe(
          profile.goal,
          profile.level,
          replacement?.mechanic === "isolation",
          metric,
        )
      : null;

  const repsMin = reranged ? reranged.repsMin : current.planned_reps_min;
  const repsMax = reranged ? reranged.repsMax : current.planned_reps_max;

  // Return the resolved values unchanged (S1, S2 test this)
  return {
    metric,
    repsMin,
    repsMax,
    equipmentIds,
    weightPrefill,
    workingWeightKg,
    isBodyweight,
  };
}
