/**
 * Build evaluateProgression input from DB rows
 * 
 * Extracted from src/app/session/actions.ts applyProgression to enable testing
 * the real production mapping from database rows to evaluateProgression input.
 * 
 * This is the code path that HIGH-2 mutants target:
 * - repsMin wired to planned_reps_max
 * - repsMin dropped or defaulting to 0
 * - wrong state weight source
 */

import type { Database } from "../../lib/database.types";
import type { ExerciseMeta, ProgressState } from "../program/progression";

type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type SessionExerciseRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  metric: "reps" | "seconds" | null;
  exercises: {
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    movement_pattern: MovementPattern;
    equipment_ids: string[];
    progression_chain: string | null;
    progression_rank: number | null;
  } | null;
};

export type SessionSetRow = {
  reps: number | null;
  weight_kg: string | number | null;
  duration_seconds: number | null;
};

export type ExerciseProgressRow = {
  current_working_weight_kg: string | number | null;
  current_target_reps: number | null;
  consecutive_failures: number;
  best_weight_kg: string | number | null;
  best_reps: number | null;
  best_e1rm: string | number | null;
  total_sessions: number;
} | null;

export type SessionRow = {
  is_deload: boolean | null;
  local_date: string | null;
  program_id: string | null;
};

export function buildProgressionInput(
  sessionExercise: SessionExerciseRow,
  sets: SessionSetRow[],
  progress: ExerciseProgressRow,
  session: SessionRow,
  feel: "easy" | "right" | "hard" | null,
) {
  const ex = sessionExercise.exercises;
  if (!ex) {
    throw new Error("Exercise data missing");
  }

  const meta: ExerciseMeta = {
    mechanic: ex.mechanic,
    movementPattern: ex.movement_pattern,
    metric: sessionExercise.metric ?? "reps",
    isBodyweight: (ex.equipment_ids ?? []).length === 0,
    progressionChain: ex.progression_chain,
    progressionRank: ex.progression_rank,
  };

  const state: ProgressState = {
    currentWorkingWeightKg:
      progress?.current_working_weight_kg === null || progress === null
        ? null
        : Number(progress.current_working_weight_kg),
    currentTargetReps: progress?.current_target_reps ?? null,
    consecutiveFailures: progress?.consecutive_failures ?? 0,
    bestWeightKg:
      progress?.best_weight_kg === null || progress === null
        ? null
        : Number(progress.best_weight_kg),
    bestReps: progress?.best_reps ?? null,
    bestE1rm:
      progress?.best_e1rm === null || progress === null ? null : Number(progress.best_e1rm),
    totalSessions: progress?.total_sessions ?? 0,
  };

  return {
    sets: sets.map((s) => ({
      reps: s.reps,
      weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
      durationSeconds: s.duration_seconds,
    })),
    plannedSets: sessionExercise.planned_sets ?? 3,
    repsMin: sessionExercise.planned_reps_min ?? 8,
    repsMax: sessionExercise.planned_reps_max ?? 12,
    feel,
    meta,
    state,
    isDeload: session.is_deload ?? false,
    // equipmentIds and unit intentionally omitted to match main's behavior
    // (first-miss equipment drops are wired in #120, not this PR)
  };
}
