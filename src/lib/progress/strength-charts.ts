import type { Point } from "@/components/charts";
import { kgToLb, type UnitsPreference, weightLabel } from "@/lib/units";

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
  unitLabel: string;
};

/**
 * Fetch-shaping helper: takes exercise_strength_history rows as fetched from
 * the DB (descending order, newest first) and returns chart-ready data with
 * points ordered oldest to newest (chronological).
 *
 * B3/C1: e1RM is a weight - converts to user's units and adds unit label.
 * B1/B2/C2: Includes all sessions (including deloads) but marks deload points.
 *
 * This is the entry point for Progress page and tests. It reverses the
 * descending fetch order so charts plot left-to-right oldest to newest.
 */
export function buildStrengthChartsFromDescendingRows(
  rowsNewestFirst: StrengthHistoryRow[],
  shortDateFn: (iso: string) => string,
  units: UnitsPreference = "metric",
  deloadDates: Set<string> = new Set()
): ExerciseChart[] {
  return buildStrengthCharts([...rowsNewestFirst].reverse(), shortDateFn, units, deloadDates);
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
  units: UnitsPreference = "metric",
  deloadDates: Set<string> = new Set()
): ExerciseChart[] {
  const byExercise = new Map<string, ExerciseChart>();
  const unitLabelText = weightLabel(units);

  for (const row of rows) {
    if (!row.exercise_id || !row.local_date || row.best_e1rm === null) continue;

    const entry = byExercise.get(row.exercise_id) ?? {
      name: row.exercise_name ?? "Exercise",
      points: [] as Point[],
      unitLabel: unitLabelText,
    };

    // C1: Convert e1RM to user's units
    const value = units === "imperial" ? kgToLb(row.best_e1rm) : row.best_e1rm;

    // C2: Keep all points (including deloads), flag deload points
    const isDeload = deloadDates.has(row.local_date);

    entry.points.push({
      label: shortDateFn(row.local_date),
      value: Number(value),
      // Store deload flag for potential visual styling
      ...(isDeload && { isDeload: true }),
    });

    byExercise.set(row.exercise_id, entry);
  }

  return [...byExercise.values()]
    .filter((e) => e.points.length >= 1)  // Include single-point charts
    .sort((a, b) => b.points.length - a.points.length);
}
