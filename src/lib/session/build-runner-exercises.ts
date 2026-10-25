import type { Database } from "@/lib/database.types";
import { resolveTarget } from "./display-target";

type Muscle = Database["public"]["Enums"]["muscle"];
type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];

/**
 * Mapped exercise data for the session runner.
 * Extracted from page.tsx session-exercises mapping for testability (M-2).
 */
export type SessionExerciseRow = {
  id: string;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  metric: ExerciseMetric | null;
  exercises: {
    id: string;
    name: string;
    cue: string | null;
    movement_pattern: Database["public"]["Enums"]["movement_pattern"];
    primary_muscles: Muscle[];
    equipment_ids: string[];
  } | null;
};

export type ExerciseProgressRow = {
  exercise_id: string;
  current_working_weight_kg: number | null;
  current_target_reps: number | null;
};

export type RunnerExerciseInput = {
  row: SessionExerciseRow;
  progress: ExerciseProgressRow | undefined;
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
