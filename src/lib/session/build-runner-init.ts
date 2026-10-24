/**
 * Build runner initial state from database rows
 * Extracted from page.tsx for testing
 */

import { effectiveRepsMax } from "../program/effective-target";
import { suggestedWeight } from "../program/progression";
import { isBodyweightEquipment } from "../program/bodyweight";

type ProgressRecord = {
  current_working_weight_kg: number | null;
  current_target_reps: number | null;
};

type SessionExerciseRow = {
  id: string;
  metric: string | null;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  status: string | null;
  feel: string | null;
  exercises?: {
    id: string;
    name: string;
    cue: string | null;
    equipment_ids: string[];
    mechanic: string | null;
    movement_pattern: string | null;
    primary_muscles: string[];
  } | null;
};

export type RunnerExercise = {
  id: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  metric: string;
  primaryMuscles: string[];
  plannedSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  status: string | null;
  feel: string | null;
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  isBodyweight: boolean;
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
      metric: r.metric ?? "reps",
      primaryMuscles: ex?.primary_muscles ?? [],
      plannedSets: r.planned_sets ?? 3,
      repsMin: r.planned_reps_min ?? 8,
      repsMax: effectiveRepsMax({
        plannedMax: r.planned_reps_max ?? 12,
        progressedTarget: progress?.current_target_reps,
        isBodyweight,
        usedWeight: working,
      }),
      restSeconds: r.rest_seconds ?? 90,
      status: r.status,
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
          equipmentIds: ex?.equipment_ids ?? [],
        }
      ),
      isBodyweight,
    };
  });
}
