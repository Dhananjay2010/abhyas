/**
 * Build the exercise rows for Today page from actual session exercises or template.
 * Extracted for testing (MEDIUM-1).
 */

import type { Database } from "@/lib/database.types";
import { mapTemplateRows, type TemplateRow } from "./map-template-rows";

type ActualRow = {
  order_index: number;
  planned_sets: number | null;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number | null;
  status: Database["public"]["Enums"]["exercise_status"] | null;
  metric: Database["public"]["Enums"]["exercise_metric"] | null;
  swapped_from_exercise_id: string | null;
  exercises: {
    name: string;
    cue: string | null;
  } | null;
};

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

export function buildTodayRows(params: {
  actual: ActualRow[] | null;
  template: TemplateRow[];
  isDeload: boolean;
}): TodayRow[] {
  const { actual, template, isDeload } = params;

  // Actual session exercises (from an in-progress or planned session) win over template
  if (actual && actual.length > 0) {
    return actual.map((r) => ({
      key: `s${r.order_index}`,
      name: r.exercises?.name ?? "",
      cue: r.exercises?.cue ?? null,
      metric: r.metric ?? null,
      sets: r.planned_sets,
      repsMin: r.planned_reps_min,
      repsMax: r.planned_reps_max,
      restSeconds: r.rest_seconds,
      skipped: r.status === "skipped",
      swappedIn: r.swapped_from_exercise_id !== null,
    }));
  }

  // No actual rows: use template with deload transform if needed
  const displayRows = mapTemplateRows(template, isDeload);
  return displayRows.map((row) => ({
    ...row,
    swappedIn: false,
  }));
}
