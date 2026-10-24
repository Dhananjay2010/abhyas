import type { Database } from "@/lib/database.types";
import { resolveSessionTargets } from "@/lib/program/session-targets";

/**
 * The metric to stamp on a session exercise, from an embedded `exercises` row.
 *
 * PostgREST types a to-one embed as either an object or an array depending on
 * how it infers the relationship, and the shape is not worth arguing with at
 * four call sites. `reps` is the safe default: it is the column default too,
 * and it is what every exercise was before `metric` existed.
 */
function metricOf(embedded: unknown): Database["public"]["Enums"]["exercise_metric"] {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const m = (row as { metric?: string } | null | undefined)?.metric;
  return m === "seconds" ? "seconds" : "reps";
}

/**
 * Build session exercise rows from planned exercises, applying deload if needed.
 *
 * Exported for testing. Production code calls this from startSession and
 * ensureSessionExercises in actions.ts.
 *
 * loadReducible determination:
 * - false for bodyweight exercises (empty equipment_ids), holds, and exercises without known weights
 * - true for exercises with equipment (potential for progressive load)
 */
export function buildSessionExerciseRows<
  T extends {
    exercise_id: string;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
    exercises: unknown;
  },
>(
  plannedRows: T[],
  context: { isDeload: boolean },
): Array<{
  exercise_id: string;
  order_index: number;
  planned_sets: number;
  planned_reps_min: number;
  planned_reps_max: number;
  rest_seconds: number;
  metric: Database["public"]["Enums"]["exercise_metric"];
}> {
  return plannedRows.map((p) => {
    const metric = metricOf(p.exercises);
    const embedded = Array.isArray(p.exercises) ? p.exercises[0] : p.exercises;
    const equipmentIds = (embedded as { equipment_ids?: string[] } | null | undefined)?.equipment_ids ?? [];
    
    // loadReducible is false for bodyweight (no equipment), holds, or no-weight exercises
    // It's true for exercises with equipment (can add weight progressively)
    const loadReducible = equipmentIds.length > 0 && metric === "reps";

    const dose = resolveSessionTargets(
      {
        target_sets: p.target_sets,
        target_reps_min: p.target_reps_min,
        target_reps_max: p.target_reps_max,
        rest_seconds: p.rest_seconds,
      },
      { isDeload: context.isDeload, loadReducible, metric },
    );
    return {
      exercise_id: p.exercise_id,
      order_index: p.order_index,
      planned_sets: dose.sets,
      planned_reps_min: dose.repsMin,
      planned_reps_max: dose.repsMax,
      rest_seconds: dose.restSeconds,
      metric,
    };
  });
}
