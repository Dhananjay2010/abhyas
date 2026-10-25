/**
 * Page wiring helper that folds sessions query results into buildTodayState input.
 * 
 * This ensures that error states (null values) are correctly propagated through
 * to buildTodayState without being defaulted to false at the page layer.
 * 
 * Tests: test-page-wiring.ts, test-load-failure-guard.ts
 */

import type { Database } from "@/lib/database.types";
import { hasStartedAnyOrNull } from "./load-failure-guard";
import type { SessionsQueryResult } from "./load-failure-guard";
import { todayStateInputFromRows, type TodayStateInputRows } from "./page-input";
import type { BuildTodayStateInput } from "./build-state";
import type { YesterdaySessionWithCount } from "./yesterday-sessions";

type DayType = Database["public"]["Enums"]["day_type"];

export type PageWiringInput = {
  profile: {
    created_at: string | null;
    timezone: string | null;
  };
  program: {
    id: string;
    started_on: string;
  };
  days: Array<{
    day_index: number;
    day_type: DayType;
    label: string | null;
  }>;
  allSessionsRes: SessionsQueryResult;
  todaySessions: Array<{
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    started_at: string | null;
  }>;
  yesterdaySessions: YesterdaySessionWithCount[] | null;
  timezone: string;
  localToday: string;
  yesterday: string;
  dayType: DayType | null;
  strengthDone: boolean;
  strengthOpen: boolean;
};

export type PageWiringOutput = {
  hasStartedAny: boolean | null;
  todayStateInput: BuildTodayStateInput;
};

/**
 * Build today state input from page-level data, preserving error states.
 * 
 * When yesterday's sessions query failed, marks yesterdayUnknown=true
 * which suppresses only the missed prompt while keeping isTraining,
 * rest-day content, and other state derived from today's data.
 */
export function buildPageState(input: PageWiringInput): PageWiringOutput {
  // Check if user has started any strength or yoga session
  // Preserve null (unknown state) - don't default to false here
  const hasStartedAny = hasStartedAnyOrNull(input.allSessionsRes);

  // If yesterday's sessions query failed, mark as unknown
  // This suppresses only the missed prompt while keeping other state
  const yesterdayUnknown = input.yesterdaySessions === null;
  const yesterdaySessions = input.yesterdaySessions || [];

  // Build the rows input
  const rows: TodayStateInputRows = {
    profile: input.profile,
    program: input.program,
    days: input.days,
    todaySessions: input.todaySessions,
    yesterdaySessions,
    yesterdayUnknown,
    timezone: input.timezone,
    localToday: input.localToday,
    yesterday: input.yesterday,
    dayType: input.dayType,
    strengthDone: input.strengthDone,
    strengthOpen: input.strengthOpen,
    hasStartedAny,
  };

  return {
    hasStartedAny,
    todayStateInput: todayStateInputFromRows(rows),
  };
}
