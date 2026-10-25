/**
 * Map template rows to Today's display format, applying deload prescription.
 * Extracted for testing (MEDIUM-1).
 */

import { todayPrescription } from "./deload-prescription";

export type TemplateRow = {
  order_index: number;
  exercises: {
    name: string;
    cue: string | null;
    metric: "reps" | "seconds" | null;
  } | null;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};

export type DisplayRow = {
  key: string;
  name: string;
  cue: string | null;
  metric: "reps" | "seconds" | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  skipped: false;
  swappedIn: false;
};

/**
 * Map template rows to display format, applying deload prescription when needed.
 * 
 * @param template - The program day template rows
 * @param isDeload - Whether this is a deload week
 * @returns Mapped display rows with deload prescription applied
 */
export function mapTemplateRows(
  template: TemplateRow[],
  isDeload: boolean,
): DisplayRow[] {
  return template.map((r) => {
    const p = todayPrescription(r, isDeload);
    return {
      key: `p${r.order_index}`,
      name: r.exercises?.name ?? "",
      cue: r.exercises?.cue ?? null,
      metric: r.exercises?.metric ?? null,
      sets: p.sets,
      repsMin: p.repsMin,
      repsMax: p.repsMax,
      restSeconds: p.restSeconds,
      skipped: false,
      swappedIn: false,
    };
  });
}
