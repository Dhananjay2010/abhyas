/**
 * Pure helper to build today's exercise rows
 * Used for both template preview (before start) and started sessions
 */

import { isBodyweightEquipment } from "../program/bodyweight";
import { effectiveRepsMax } from "../program/effective-target";

type ProgressRecord = {
  current_working_weight_kg: number | null;
  current_target_reps: number | null;
};

type SessionExerciseRow = {
  order_index: number;
  exercise_id: string | null;
  exercises: {
    name: string;
    cue: string | null;
    equipment_ids: string[];
  } | null;
  metric: string | null;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  status: "pending" | "skipped" | "completed" | "swapped_out" | null;
  swapped_from_exercise_id: string | null;
};

type TemplateExerciseRow = {
  order_index: number;
  exercise_id: string | null;
  exercises: {
    name: string;
    cue: string | null;
    metric: string | null;
    equipment_ids: string[];
  } | null;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};

import type { Database } from "../database.types";

export type TodayRow = {
  key: string;
  name: string;
  cue: string | null;
  metric: Database["public"]["Enums"]["exercise_metric"] | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  skipped: boolean;
  swappedIn: boolean;
};

/**
 * Build rows for a started session
 * 
 * For exercises already finished (status="completed"):
 *   Show the planned value they ran with, not the newly progressed target
 * 
 * For exercises not yet finished:
 *   Show the progressed target (e.g., planned 30s, progress 40 → 40s)
 */
export function buildStartedSessionRows(
  sessionExercises: SessionExerciseRow[],
  progressByExercise: Map<string, ProgressRecord>
): TodayRow[] {
  return sessionExercises.map((r) => {
    const progress = r.exercise_id ? progressByExercise.get(r.exercise_id) : undefined;
    const isBodyweight = isBodyweightEquipment(r.exercises?.equipment_ids ?? []);
    const workingWeightKg =
      progress?.current_working_weight_kg === null || !progress
        ? null
        : Number(progress.current_working_weight_kg);
    
    // For finished exercises, use planned max (what they actually ran with)
    // For unfinished, use progressed target via effectiveRepsMax
    const effectiveMax =
      r.status === "completed"
        ? r.planned_reps_max
        : r.planned_reps_max !== null
          ? effectiveRepsMax({
              plannedMax: r.planned_reps_max,
              progressedTarget: progress?.current_target_reps,
              isBodyweight,
              usedWeight: workingWeightKg,
            })
          : null;
    
    return {
      key: `s${r.order_index}`,
      name: r.exercises?.name ?? "",
      cue: r.exercises?.cue ?? null,
      metric: (r.metric as Database["public"]["Enums"]["exercise_metric"]) ?? null,
      sets: r.planned_sets,
      repsMin: r.planned_reps_min,
      repsMax: effectiveMax,
      restSeconds: r.rest_seconds,
      skipped: r.status === "skipped",
      swappedIn: r.swapped_from_exercise_id !== null,
    };
  });
}

/**
 * Build rows for template preview (before session starts)
 * Now includes progressed targets for unloaded bodyweight exercises
 */
export function buildTemplateRows(
  templateExercises: TemplateExerciseRow[],
  progressByExercise: Map<string, ProgressRecord>
): TodayRow[] {
  return templateExercises.map((r) => {
    const progress = r.exercise_id ? progressByExercise.get(r.exercise_id) : undefined;
    const isBodyweight = isBodyweightEquipment(r.exercises?.equipment_ids ?? []);
    const workingWeightKg =
      progress?.current_working_weight_kg === null || !progress
        ? null
        : Number(progress.current_working_weight_kg);
    
    // Use progressed target for unloaded bodyweight exercises
    const effectiveMax = r.target_reps_max !== null
      ? effectiveRepsMax({
          plannedMax: r.target_reps_max,
          progressedTarget: progress?.current_target_reps,
          isBodyweight,
          usedWeight: workingWeightKg,
        })
      : null;
    
    return {
      key: `p${r.order_index}`,
      name: r.exercises?.name ?? "",
      cue: r.exercises?.cue ?? null,
      metric: (r.exercises?.metric as Database["public"]["Enums"]["exercise_metric"]) ?? null,
      sets: r.target_sets,
      repsMin: r.target_reps_min,
      repsMax: effectiveMax,
      restSeconds: r.rest_seconds,
      skipped: false,
      swappedIn: false,
    };
  });
}
