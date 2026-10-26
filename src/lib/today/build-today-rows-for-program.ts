/**
 * Build today rows with deload computation for the Today page.
 * 
 * Extracted for testing (T1, T2): the isDeload computation (week === deload_week)
 * and the buildTodayRows call together, so passing false or skipping the deload
 * check fails a test.
 */

import { cycleWeekFor } from "@/lib/program/block-range";
import { buildTodayRows, type TodayRow } from "./build-today-rows";
import type { Database } from "@/lib/database.types";
import type { UnitsPreference } from "@/lib/units";
import { wireLoggedSets, type LoggedSetsData } from "./wire-logged-sets";

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

type TemplateRow = {
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
  exercises: {
    name: string;
    cue: string | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
  } | null;
};

export type BuildTodayRowsForProgramInput = {
  actual: ActualRow[] | null;
  template: TemplateRow[];
  program: {
    started_on: string;
    week_offset: number;
    deload_week: number | null;
  };
  localToday: string;
  /**
   * The sets actually logged in today's completed session. When given, each
   * performed row shows them ("80 kg × 10, 10, 9") instead of the prescription.
   */
  logged?: { exercises: LoggedSetsData[]; units: UnitsPreference } | null;
};

/**
 * Build today rows with deload computation.
 * 
 * Combines:
 * 1. Computing isDeload from week === program.deload_week
 * 2. Calling buildTodayRows with that flag
 * 
 * Mutants T1 (passing false) and T2 (skipping buildTodayRows) must fail a test
 * that calls this function.
 */
export function buildTodayRowsForProgram(input: BuildTodayRowsForProgramInput): TodayRow[] {
  const { actual, template, program, localToday, logged } = input;

  // Compute isDeload: week === deload_week (null deload_week means never deload)
  const week = cycleWeekFor(
    { started_on: program.started_on, week_offset: program.week_offset },
    localToday,
  );
  const isDeload = week === program.deload_week;

  // Build rows with the deload flag
  const rows = buildTodayRows({ actual, template, isDeload });
  if (logged) wireLoggedSets(rows, logged.exercises, logged.units);
  return rows;
}
