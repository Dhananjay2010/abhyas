/**
 * Session exercise preparation utilities.
 *
 * Shared logic for creating session exercise rows from program day exercises,
 * applying deload when needed.
 */
import { applyDeload } from "@/lib/program/prescription";
import type { Database } from "@/lib/database.types";

/**
 * Program day exercise with embedded exercise info.
 */
type ProgramDayExercise = {
  exercise_id: string;
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
  exercises: { metric?: string } | null;
};

/**
 * Session exercise row to insert.
 */
type SessionExerciseRow = {
  session_id: string;
  user_id: string;
  exercise_id: string;
  order_index: number;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  metric: Database["public"]["Enums"]["exercise_metric"];
};

/**
 * Convert program day exercises to session exercise rows, applying deload if needed.
 *
 * Week 4 of a block cuts volume; the weight suggestion is reduced separately
 * when the session is rendered. This is the ONE shared function that applies
 * deload, used by every path that creates session exercises (startSession,
 * ensureSessionExercises, train-anyway, swap, tomorrow-choice, rebuild re-point).
 */
export function prepareSessionExercises(
  sessionId: string,
  userId: string,
  programDayExercises: ProgramDayExercise[],
  isDeload: boolean,
): SessionExerciseRow[] {
  return programDayExercises.map((p) => {
    const dose = isDeload
      ? applyDeload({
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        })
      : {
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        };
    return {
      session_id: sessionId,
      user_id: userId,
      exercise_id: p.exercise_id,
      order_index: p.order_index,
      planned_sets: dose.sets,
      planned_reps_min: dose.repsMin,
      planned_reps_max: dose.repsMax,
      rest_seconds: dose.restSeconds,
      metric: metricOf(p.exercises),
    };
  });
}

/**
 * The metric to stamp on a session exercise, from an embedded `exercises` row.
 *
 * PostgREST types a to-one embed as either an object or an array depending on
 * how it infers the relationship, and the shape is not worth arguing with at
 * four call sites. `reps` is the safe default: it is the column default too,
 * and it is what every exercise was before `metric` existed.
 */
export function metricOf(embedded: unknown): Database["public"]["Enums"]["exercise_metric"] {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const m = (row as { metric?: string } | null | undefined)?.metric;
  return m === "seconds" ? "seconds" : "reps";
}
