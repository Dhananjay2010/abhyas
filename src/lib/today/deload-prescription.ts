/**
 * Today prescription helpers for deload display.
 * 
 * Ensures Today shows the same prescription the session will create,
 * using applyDeload as the single source of truth.
 */

import { applyDeload, type Prescription } from "../program/prescription";

export type TodayExerciseRow = {
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};

export type TodayPrescription = {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
};

/**
 * Transform a program day exercise for display on Today.
 * 
 * In a deload week, applies the same deload transform that session creation uses.
 * In a normal week, returns the prescription unchanged.
 * 
 * @param row - The program day exercise (template prescription)
 * @param isDeload - Whether this is a deload week
 * @returns The prescription to display (deloaded if applicable)
 */
export function todayPrescription(
  row: TodayExerciseRow,
  isDeload: boolean,
): TodayPrescription {
  if (!isDeload || row.target_sets === null) {
    return {
      sets: row.target_sets,
      repsMin: row.target_reps_min,
      repsMax: row.target_reps_max,
      restSeconds: row.rest_seconds,
    };
  }

  const prescription: Prescription = {
    sets: row.target_sets,
    repsMin: row.target_reps_min ?? 0,
    repsMax: row.target_reps_max ?? 0,
    restSeconds: row.rest_seconds ?? 0,
  };

  const deloaded = applyDeload(prescription);

  return {
    sets: deloaded.sets,
    repsMin: deloaded.repsMin,
    repsMax: deloaded.repsMax,
    restSeconds: deloaded.restSeconds,
  };
}
