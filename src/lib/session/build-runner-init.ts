/**
 * Build runner initial state from database rows
 * Extracted from page.tsx for testing
 */

import type { Database } from "@/lib/database.types";
import { effectiveRepsMax } from "../program/effective-target";
import { suggestedWeight } from "../program/progression";
import { isBodyweightEquipment } from "../program/bodyweight";

type Muscle = Database["public"]["Enums"]["muscle"];
type ExerciseMetric = Database["public"]["Enums"]["exercise_metric"];
type ExerciseStatus = Database["public"]["Enums"]["exercise_status"];
type Feel = Database["public"]["Enums"]["set_feel"];

type ProgressRecord = {
  current_working_weight_kg: number | null;
  current_target_reps: number | null;
};

type SessionExerciseRow = {
  id: string;
  metric: ExerciseMetric | null;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  status: ExerciseStatus | null;
  feel: Feel | null;
  exercises?: {
    id: string;
    name: string;
    cue: string | null;
    equipment_ids: readonly string[];
    mechanic: string | null;
    movement_pattern: string | null;
    primary_muscles: readonly Muscle[];
  } | null;
  session_sets?: Array<{
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    is_warmup_set: boolean;
  }> | null;
};

export type RunnerExercise = {
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
  sets: Array<{
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }>;
};

export function buildRunnerInit(
  rows: SessionExerciseRow[],
  progressByExercise: Map<string, ProgressRecord>,
  remembersWeights: boolean,
  isDeload: boolean
): RunnerExercise[] {
  return rows.map((r) => {
    const ex = r.exercises;
    const progress = remembersWeights ? progressByExercise.get(ex?.id ?? "") : undefined;
    const working =
      progress?.current_working_weight_kg === null || progress === undefined
        ? null
        : Number(progress.current_working_weight_kg);
    const isBodyweight = isBodyweightEquipment(ex?.equipment_ids ?? []);
    
    return {
      id: r.id,
      exerciseId: ex?.id ?? "",
      name: ex?.name ?? "Exercise",
      cue: ex?.cue ?? null,
      metric: (r.metric ?? "reps") as ExerciseMetric,
      primaryMuscles: (ex?.primary_muscles ?? []) as Muscle[],
      plannedSets: r.planned_sets ?? 3,
      repsMin: r.planned_reps_min ?? 8,
      repsMax: effectiveRepsMax({
        plannedMax: r.planned_reps_max ?? 12,
        progressedTarget: progress?.current_target_reps,
        isBodyweight,
        usedWeight: working,
      }),
      restSeconds: r.rest_seconds ?? 90,
      status: (r.status ?? "planned") as ExerciseStatus,
      feel: r.feel,
      workingWeightKg: working,
      suggestedWeightKg: suggestedWeight(
        { currentWorkingWeightKg: working },
        isDeload,
        {
          mechanic: (ex?.mechanic as "compound" | "isolation" | null) ?? null,
          movementPattern: (ex?.movement_pattern ?? "other") as "hinge" | "squat" | "other",
          metric: (r.metric ?? "reps") as "reps" | "seconds",
          isBodyweight,
          progressionChain: null,
          progressionRank: null,
          equipmentIds: ex?.equipment_ids ? [...ex.equipment_ids] : [],
        }
      ),
      isBodyweight,
      sets: (r.session_sets ?? [])
        .filter((set) => !set.is_warmup_set)
        .sort((a, b) => a.set_number - b.set_number)
        .map((set) => ({
          setNumber: set.set_number,
          reps: set.reps,
          weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
          durationSeconds: set.duration_seconds,
        })),
    };
  });
}
