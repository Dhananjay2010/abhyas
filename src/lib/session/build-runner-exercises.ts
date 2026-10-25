import type { Database } from "@/lib/database.types";
import { resolveTarget } from "./display-target";
import { suggestedWeight } from "@/lib/program/progression";
import { progressionInputsFromExercise } from "./progression-inputs";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type ExerciseStatus = Database["public"]["Enums"]["exercise_status"];
type Feel = Database["public"]["Enums"]["set_feel"];
type Muscle = Database["public"]["Enums"]["muscle"];

/**
 * Structural input types for buildRunnerExercise.
 * These accept the actual Supabase query results without casts.
 * Only the fields that buildRunnerExercise reads are specified.
 */

export type SessionExerciseInput = {
  readonly id: string;
  readonly planned_sets: number | null;
  readonly planned_reps_min: number | null;
  readonly planned_reps_max: number | null;
  readonly rest_seconds: number | null;
  readonly status: ExerciseStatus | null;
  readonly feel: Feel | null;
  readonly metric: ExerciseMetric | null;
  readonly exercises: {
    readonly id: string;
    readonly name: string;
    readonly cue: string | null;
    readonly mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    readonly movement_pattern: MovementPattern;
    readonly primary_muscles: readonly Muscle[];
    readonly equipment_ids: readonly string[];
  } | null;
  readonly session_sets: readonly {
    readonly set_number: number;
    readonly reps: number | null;
    readonly weight_kg: number | null;
    readonly duration_seconds: number | null;
    readonly is_warmup_set: boolean;
    readonly completed_at: string;
  }[];
};

export type ProgressInput = {
  readonly current_working_weight_kg: number | null;
  readonly current_target_reps: number | null;
} | undefined;

export type RunnerExerciseInput = {
  row: SessionExerciseInput;
  progress: ProgressInput;
  remembersWeights: boolean;
  isDeload: boolean;
  userUnits: string | null | undefined;
};

export type RunnerExerciseOutput = {
  id: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  metric: ExerciseMetric;
  primaryMuscles: Muscle[];
  plannedSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  status: ExerciseStatus;
  feel: Feel | null;
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  isBodyweight: boolean;
  sets: {
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }[];
  lastLoggedAt?: string | null;
};

/**
 * Pure function: map a session exercise row + progress to complete runner display values.
 * 
 * This is the core logic extracted from page.tsx for comprehensive testing.
 * It resolves ALL RunnerExercise fields so page.tsx can do just `rows.map(buildRunnerExercise)`.
 * 
 * @returns The complete RunnerExercise object for the runner
 */
export function buildRunnerExercise(input: RunnerExerciseInput): RunnerExerciseOutput {
  const { row, progress: progressRow, remembersWeights, isDeload, userUnits } = input;
  const r = row;
  const ex = r.exercises;
  
  const progress = remembersWeights ? progressRow : undefined;
  const working =
    progress?.current_working_weight_kg === null || progress === undefined
      ? null
      : Number(progress.current_working_weight_kg);
  const equipmentIds = ex?.equipment_ids ?? [];
  const isBodyweight = equipmentIds.length === 0;
  const metric = r.metric ?? "reps";
  
  const target = resolveTarget({
    metric,
    plannedMin: r.planned_reps_min ?? 8,
    plannedMax: r.planned_reps_max ?? 12,
    currentTargetReps: progress?.current_target_reps,
    equipmentIds,
    currentWorkingWeightKg: working,
  });

  // Get equipment IDs and unit for progression
  const progInputs = ex ? progressionInputsFromExercise({ equipment_ids: equipmentIds }, userUnits) : {};

  const suggested = suggestedWeight(
    { currentWorkingWeightKg: working },
    isDeload,
    {
      mechanic: ex?.mechanic ?? null,
      movementPattern: ex?.movement_pattern ?? "other",
      metric,
      isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    progInputs.equipmentIds,
    progInputs.unit,
  );

  // Filter out warm-up sets and compute lastLoggedAt
  const workingSets = (r.session_sets ?? []).filter((set) => !set.is_warmup_set);
  const lastLoggedAt = workingSets.reduce<string | null>(
    (latest, set) => (latest === null || set.completed_at > latest ? set.completed_at : latest),
    null
  );

  return {
    id: r.id,
    exerciseId: ex?.id ?? "",
    name: ex?.name ?? "Exercise",
    cue: ex?.cue ?? null,
    metric,
    primaryMuscles: [...(ex?.primary_muscles ?? [])],
    plannedSets: r.planned_sets ?? 3,
    repsMin: target.min,
    repsMax: target.max,
    restSeconds: r.rest_seconds ?? 90,
    status: r.status ?? "pending",
    feel: r.feel ?? null,
    workingWeightKg: working,
    suggestedWeightKg: suggested,
    isBodyweight,
    sets: workingSets
      .sort((a, b) => a.set_number - b.set_number)
      .map((set) => ({
        setNumber: set.set_number,
        reps: set.reps,
        weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
        durationSeconds: set.duration_seconds,
      })),
    lastLoggedAt,
  };
}

/**
 * Pure function: apply a swap to an exercise, recomputing targets without clearing weights.
 * 
 * When the user swaps an exercise mid-session, the targets (repsMin/repsMax) and
 * isBodyweight flag must be recomputed for the new exercise, but the weights
 * (workingWeightKg, suggestedWeightKg) are kept as-is to avoid conflicting with #125's prefill.
 * 
 * This matches main's behavior before the swap was added: main didn't clear weights,
 * so neither should we.
 * 
 * @param exercise - The original exercise being swapped
 * @param swapped - The swapped exercise row data
 * @param progress - The progress row for the swapped exercise (if any)
 * @param remembersWeights - Whether the planning mode remembers weights
 * @returns Updated exercise with recomputed targets
 */
export function applySwap(
  exercise: RunnerExerciseOutput,
  swapped: {
    readonly id: string;
    readonly name: string;
    readonly cue: string | null;
    readonly metric: ExerciseMetric;
    readonly primary_muscles: readonly Muscle[];
    readonly equipment_ids: readonly string[];
  },
  progress: ProgressInput,
  remembersWeights: boolean,
): RunnerExerciseOutput {
  const progressData = remembersWeights ? progress : undefined;
  const working =
    progressData?.current_working_weight_kg === null || progressData === undefined
      ? null
      : Number(progressData.current_working_weight_kg);
  
  const equipmentIds = swapped.equipment_ids ?? [];
  const isBodyweight = equipmentIds.length === 0;
  
  // Recompute target for the swapped exercise
  const target = resolveTarget({
    metric: swapped.metric,
    plannedMin: exercise.repsMin, // Keep plan range from session
    plannedMax: exercise.repsMax,
    currentTargetReps: progressData?.current_target_reps,
    equipmentIds,
    currentWorkingWeightKg: working,
  });

  return {
    ...exercise,
    exerciseId: swapped.id,
    name: swapped.name,
    cue: swapped.cue,
    metric: swapped.metric,
    primaryMuscles: [...(swapped.primary_muscles ?? [])],
    repsMin: target.min,
    repsMax: target.max,
    isBodyweight,
    // KEEP weights as-is (don't clear them) to match main's behavior
    // and avoid conflicting with #125's prefill logic
    // workingWeightKg: unchanged
    // suggestedWeightKg: unchanged
  };
}
