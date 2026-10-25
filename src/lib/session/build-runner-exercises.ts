import type { Database } from "@/lib/database.types";
import { resolveTarget } from "./display-target";

type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

/**
 * Structural input types for mapSessionExercise.
 * These accept the actual Supabase query results without casts.
 * Only the fields that mapSessionExercise reads are specified.
 */

export type SessionExerciseInput = {
  readonly planned_reps_min: number | null;
  readonly planned_reps_max: number | null;
  readonly metric: ExerciseMetric | null;
  readonly exercises: {
    readonly id: string;
    readonly equipment_ids: readonly string[];
  } | null;
};

export type ProgressInput = {
  readonly current_working_weight_kg: number | null;
  readonly current_target_reps: number | null;
} | undefined;

export type RunnerExerciseInput = {
  row: SessionExerciseInput;
  progress: ProgressInput;
  remembersWeights: boolean;
};

export type RunnerExerciseOutput = {
  exerciseId: string;
  metric: ExerciseMetric;
  repsMin: number;
  repsMax: number;
  isBodyweight: boolean;
  currentWorkingWeightKg: number | null;
  currentTargetReps: number | null;
};

/**
 * Pure function: map a session exercise row + progress to runner display values.
 * 
 * This is the core logic extracted from page.tsx for M-2 wiring test.
 * It resolves the displayed target using the shared helper.
 * 
 * @returns The computed exercise values for the runner
 */
export function mapSessionExercise(input: RunnerExerciseInput): RunnerExerciseOutput {
  const { row, progress: progressRow, remembersWeights } = input;
  const r = row;
  const ex = r.exercises;
  
  const progress = remembersWeights ? progressRow : undefined;
  const working =
    progress?.current_working_weight_kg === null || progress === undefined
      ? null
      : Number(progress.current_working_weight_kg);
  const isBodyweight = (ex?.equipment_ids ?? []).length === 0;
  const metric = r.metric ?? "reps";
  
  const target = resolveTarget({
    metric,
    plannedMin: r.planned_reps_min ?? 8,
    plannedMax: r.planned_reps_max ?? 12,
    currentTargetReps: progress?.current_target_reps,
    isBodyweight,
    currentWorkingWeightKg: working,
  });

  return {
    exerciseId: ex?.id ?? "",
    metric,
    repsMin: target.min,
    repsMax: target.max,
    isBodyweight,
    currentWorkingWeightKg: working,
    currentTargetReps: progress?.current_target_reps ?? null,
  };
}
