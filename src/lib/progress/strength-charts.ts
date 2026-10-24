import type { Point } from "@/components/charts";

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
 * Transform raw strength history rows into per-exercise charts with points
 * ordered oldest to newest (chronological).
 *
 * Input rows may be in any order (typically newest-first from the DB). This
 * function processes them in the order given and returns points in that same
 * order, so callers must reverse descending data before calling.
 */
export function buildStrengthCharts(
  rows: StrengthHistoryRow[],
  shortDateFn: (iso: string) => string
): ExerciseChart[] {
  const byExercise = new Map<string, ExerciseChart>();
  
  for (const row of rows) {
    if (!row.exercise_id || !row.local_date || row.best_e1rm === null) continue;
    
    const entry = byExercise.get(row.exercise_id) ?? {
      name: row.exercise_name ?? "Exercise",
      points: [] as Point[],
    };
    
    entry.points.push({
      label: shortDateFn(row.local_date),
      value: Number(row.best_e1rm),
    });
    
    byExercise.set(row.exercise_id, entry);
  }
  
  return [...byExercise.values()]
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length);
}
