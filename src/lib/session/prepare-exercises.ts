/**
 * Session exercise preparation utilities.
 *
 * Shared logic for creating session exercise rows from program day exercises.
 */
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
 * Convert program day exercises to session exercise rows.
 *
 * The is_deload parameter is kept for future use but not currently applied
 * (deload handling is owned by another PR).
 */
export function prepareSessionExercises(
  sessionId: string,
  userId: string,
  programDayExercises: ProgramDayExercise[],
  isDeload: boolean,
): SessionExerciseRow[] {
  return programDayExercises.map((p) => {
    return {
      session_id: sessionId,
      user_id: userId,
      exercise_id: p.exercise_id,
      order_index: p.order_index,
      planned_sets: p.target_sets ?? 3,
      planned_reps_min: p.target_reps_min ?? 8,
      planned_reps_max: p.target_reps_max ?? 12,
      rest_seconds: p.rest_seconds ?? 75,
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
