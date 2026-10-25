import { evaluateProgression, type ExerciseMeta, type Decision } from "@/lib/program/progression";
import { progressionInputsFromExercise } from "./progression-inputs";
import { writeExerciseProgressCore, type ProgressClient } from "./write-progress";
import type { Database } from "@/lib/database.types";

type SetFeel = Database["public"]["Enums"]["set_feel"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type ApplyProgressionInput = {
  sessionExercise: {
    id: string;
    exercise_id: string;
    planned_sets: number | null;
    planned_reps_min: number | null;
    planned_reps_max: number | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
  };
  exercise: {
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    movement_pattern: Database["public"]["Enums"]["movement_pattern"];
    equipment_ids: string[];
    progression_chain: string | null;
    progression_rank: number | null;
  };
  session: {
    is_deload: boolean | null;
    local_date: string | null;
  };
  sets: {
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
  }[];
  progress: {
    current_working_weight_kg: number | null;
    current_target_reps: number | null;
    consecutive_failures: number;
    best_weight_kg: number | null;
    best_reps: number | null;
    best_e1rm: number | null;
    total_sessions: number;
  } | null;
  userUnits: string | null | undefined;
  feel: SetFeel | null;
};

/**
 * Build ApplyProgressionInput from raw Supabase query results.
 * Takes the exact row structures as actions.ts receives them.
 */
export function buildApplyProgressionInputFromRows(params: {
  se: {
    id: string;
    exercise_id: string;
    planned_sets: number | null;
    planned_reps_min: number | null;
    planned_reps_max: number | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
    exercises: {
      mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
      movement_pattern: MovementPattern;
      equipment_ids: string[];
      progression_chain: string | null;
      progression_rank: number | null;
    };
  };
  sessionRow: {
    is_deload: boolean | null;
    local_date: string | null;
  } | null;
  setsRows: {
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
  }[];
  progressRow: {
    current_working_weight_kg: number | null;
    current_target_reps: number | null;
    consecutive_failures: number;
    best_weight_kg: number | null;
    best_reps: number | null;
    best_e1rm: number | null;
    total_sessions: number;
  } | null;
  profileRow: {
    units: string | null;
  } | null;
  feel: SetFeel | null;
}): ApplyProgressionInput {
  const { se, sessionRow, setsRows, progressRow, profileRow, feel } = params;
  return buildApplyProgressionInput(
    { id: se.id, exercise_id: se.exercise_id, planned_sets: se.planned_sets, planned_reps_min: se.planned_reps_min, planned_reps_max: se.planned_reps_max, metric: se.metric },
    se.exercises,
    sessionRow,
    setsRows,
    progressRow,
    profileRow?.units,
    feel,
  );
}

/**
 * Build ApplyProgressionInput from Supabase query results.
 * Pure function for testing the input builder in isolation.
 */
export function buildApplyProgressionInput(
  sessionExercise: {
    id: string;
    exercise_id: string;
    planned_sets: number | null;
    planned_reps_min: number | null;
    planned_reps_max: number | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
  },
  exercise: {
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    movement_pattern: MovementPattern;
    equipment_ids: string[];
    progression_chain: string | null;
    progression_rank: number | null;
  },
  session: {
    is_deload: boolean | null;
    local_date: string | null;
  } | null,
  sets: {
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
  }[],
  progress: {
    current_working_weight_kg: number | null;
    current_target_reps: number | null;
    consecutive_failures: number;
    best_weight_kg: number | null;
    best_reps: number | null;
    best_e1rm: number | null;
    total_sessions: number;
  } | null,
  userUnits: string | null | undefined,
  feel: SetFeel | null,
): ApplyProgressionInput {
  return {
    sessionExercise: {
      id: sessionExercise.id,
      exercise_id: sessionExercise.exercise_id,
      planned_sets: sessionExercise.planned_sets,
      planned_reps_min: sessionExercise.planned_reps_min,
      planned_reps_max: sessionExercise.planned_reps_max,
      metric: sessionExercise.metric,
    },
    exercise: {
      mechanic: exercise.mechanic,
      movement_pattern: exercise.movement_pattern,
      equipment_ids: exercise.equipment_ids,
      progression_chain: exercise.progression_chain,
      progression_rank: exercise.progression_rank,
    },
    session: {
      is_deload: session?.is_deload ?? null,
      local_date: session?.local_date ?? null,
    },
    sets,
    progress,
    userUnits,
    feel,
  };
}

/**
 * Core progression logic extracted from actions.ts for testing.
 * 
 * @returns The decision from evaluateProgression
 */
export async function applyProgressionCore(
  client: ProgressClient,
  userId: string,
  input: ApplyProgressionInput,
): Promise<Decision> {
  const { sessionExercise: se, exercise: ex, session, sets, progress: prior, userUnits, feel } = input;

  const meta: ExerciseMeta = {
    mechanic: ex.mechanic,
    movementPattern: ex.movement_pattern,
    metric: se.metric ?? "reps",
    isBodyweight: ex.equipment_ids.length === 0,
    progressionChain: ex.progression_chain,
    progressionRank: ex.progression_rank,
  };

  const state = {
    currentWorkingWeightKg: prior?.current_working_weight_kg === null || prior === null
      ? null
      : Number(prior.current_working_weight_kg),
    currentTargetReps: prior?.current_target_reps ?? null,
    consecutiveFailures: prior?.consecutive_failures ?? 0,
    bestWeightKg: prior?.best_weight_kg === null || prior === null ? null : Number(prior.best_weight_kg),
    bestReps: prior?.best_reps ?? null,
    bestE1rm: prior?.best_e1rm === null || prior === null ? null : Number(prior.best_e1rm),
    totalSessions: prior?.total_sessions ?? 0,
  };

  const decision = evaluateProgression({
    sets: sets.map((s) => ({
      reps: s.reps,
      weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
      durationSeconds: s.duration_seconds,
    })),
    plannedSets: se.planned_sets ?? 3,
    repsMin: se.planned_reps_min ?? 8,
    repsMax: se.planned_reps_max ?? 12,
    feel,
    meta,
    state,
    isDeload: session.is_deload ?? false,
    ...progressionInputsFromExercise(ex, userUnits),
  });

  await writeExerciseProgressCore(
    client,
    userId,
    se.exercise_id,
    decision,
    state.totalSessions,
    session.local_date ?? null,
  );

  return decision;
}
