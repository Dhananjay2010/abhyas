import type { Database } from "@/lib/database.types";
import { resolveSessionTargets } from "@/lib/program/session-targets";

/**
 * Equipment that supports bodyweight exercises but doesn't add external load.
 * Exercises using ONLY these items have loadReducible=false (rep/hold trim applies).
 */
const BODYWEIGHT_ONLY_EQUIPMENT = new Set([
  "pull_up_bar",
  "dip_bars", 
  "bench",
  "flat_bench",
  "incline_bench",
  "decline_bench",
  "stability_ball",
  "mat",
  "none",
]);

/**
 * Check if exercise is bodyweight-only (not progressively loadable).
 * True when: no equipment OR all equipment is bodyweight-only.
 */
function isBodyweightOnly(equipmentIds: string[]): boolean {
  if (equipmentIds.length === 0) return true;
  return equipmentIds.every(id => BODYWEIGHT_ONLY_EQUIPMENT.has(id));
}

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
    
    // loadReducible is false for:
    // - bodyweight-only exercises (no equipment or only bodyweight equipment like pull-up bars)
    // - holds (metric === "seconds")
    // It's true for exercises with loaded equipment (barbell, dumbbells, etc.) and reps metric
    const loadReducible = !isBodyweightOnly(equipmentIds) && metric === "reps";

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
