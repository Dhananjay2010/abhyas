/**
 * Pure helpers for Today page data transformations.
 * Extracted for testing to verify correct behavior.
 */

import { cycleWeekFor } from "@/lib/program/block-range";
import { findFirstTrainingDay, type FirstTrainingDayResult } from "@/lib/today/first-training-day";
import { getWeekRowLabel } from "@/lib/today/week-display";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type TodayPageInputs = {
  program: {
    started_on: string;
    week_offset: number;
    deload_week: number | null;
  };
  localToday: string;
  days: Array<{
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  }>;
  hasStartedAny: boolean;
  chosenByDayIndex: Map<number, string>;
};

export type TodayPageView = {
  week: number;
  isDeload: boolean;
  firstTrainingDay: FirstTrainingDayResult;
  weekRowsWithChoices: Array<{
    dayIndex: number;
    label: string;
    isChoice: boolean;
  }>;
};

/**
 * Build Today page view from inputs.
 * Tests: m2 (first-day choice), m4 (week offset), m6b (choice label).
 */
export function buildTodayView(inputs: TodayPageInputs): TodayPageView {
  const { program, localToday, days, hasStartedAny, chosenByDayIndex } = inputs;

  // m4: Week calculation must respect week_offset
  const week = cycleWeekFor(
    { started_on: program.started_on, week_offset: program.week_offset },
    localToday
  );
  const isDeload = week === program.deload_week;

  // m2: First training day must be plan day 1 (lowest day_index), not next calendar day
  const firstTrainingDay = hasStartedAny ? null : findFirstTrainingDay(days);

  // m6b: Week rows must use chosen labels when choices exist
  const weekRowsWithChoices = days.map((d) => {
    const labelInfo = getWeekRowLabel(d, chosenByDayIndex);
    return {
      dayIndex: d.day_index,
      label: labelInfo.label,
      isChoice: labelInfo.isChoice,
    };
  });

  return {
    week,
    isDeload,
    firstTrainingDay,
    weekRowsWithChoices,
  };
}
