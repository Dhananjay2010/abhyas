import type { Point } from "@/components/charts";
import { kgToLb } from "@/lib/units";

export type StrengthHistoryRow = {
  exercise_id: string | null;
  exercise_name: string | null;
  local_date: string | null;
  best_e1rm: number | null;
  top_weight_kg: number | null;
};

export type ExerciseChart = {
  name: string;
  points: Point[];
};

/**
 * Fetch-shaping helper: takes exercise_strength_history rows as fetched from
 * the DB (descending order, newest first) and returns chart-ready data with
 * points ordered oldest to newest (chronological).
 *
 * This is the entry point for Progress page and tests. It reverses the
 * descending fetch order so charts plot left-to-right oldest to newest.
 */
export function buildStrengthChartsFromDescendingRows(
  rowsNewestFirst: StrengthHistoryRow[],
  shortDateFn: (iso: string) => string,
  units: string = "metric"
): ExerciseChart[] {
  return buildStrengthCharts([...rowsNewestFirst].reverse(), shortDateFn, units);
}

/**
 * Transform raw strength history rows into per-exercise charts with points
 * in the same order as the input rows.
 *
 * Internal helper. Callers should use buildStrengthChartsFromDescendingRows
 * for DB data fetched newest-first.
 */
function buildStrengthCharts(
  rows: StrengthHistoryRow[],
  shortDateFn: (iso: string) => string,
  units: string = "metric"
): ExerciseChart[] {
  const byExercise = new Map<string, ExerciseChart>();
  
  for (const row of rows) {
    if (!row.exercise_id || !row.local_date || row.best_e1rm === null) continue;
    
    const entry = byExercise.get(row.exercise_id) ?? {
      name: row.exercise_name ?? "Exercise",
      points: [] as Point[],
    };
    
    // Convert e1RM to user's preferred units
    const e1rmKg = Number(row.best_e1rm);
    const displayValue = units === "imperial" ? kgToLb(e1rmKg) : e1rmKg;
    
    entry.points.push({
      label: shortDateFn(row.local_date),
      value: displayValue,
    });
    
    byExercise.set(row.exercise_id, entry);
  }
  
  return [...byExercise.values()]
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length);
}
