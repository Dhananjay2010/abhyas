/**
 * Pure function to build buildTodayState input from database rows.
 * Removes DB query logic from page.tsx.
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export interface TodayStateInputRows {
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
  todaySessions: Array<{
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    started_at: string | null;
  }>;
  yesterdaySessions: Array<{
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    working_set_count?: number;
  }>;
  yesterdayUnknown: boolean;
  timezone: string;
  localToday: string;
  yesterday: string;
  dayType: DayType | null;
  strengthDone: boolean;
  strengthOpen: boolean;
  hasStartedAny: boolean | null;
}

export function todayStateInputFromRows(rows: TodayStateInputRows) {
  return {
    profile: {
      created_at: rows.profile.created_at,
      timezone: rows.profile.timezone,
    },
    program: {
      id: rows.program.id,
      started_on: rows.program.started_on,
    },
    days: rows.days,
    sessions: {
      today: rows.todaySessions.map((s) => ({
        status: s.status,
        actual_type: s.actual_type,
        program_id: s.program_id,
        started_at: s.started_at,
      })),
      yesterday: rows.yesterdaySessions.map((s) => ({
        status: s.status,
        actual_type: s.actual_type,
        program_id: s.program_id,
        working_set_count: s.working_set_count,
      })),
    },
    yesterdayUnknown: rows.yesterdayUnknown,
    timezone: rows.timezone,
    localToday: rows.localToday,
    yesterday: rows.yesterday,
    dayType: rows.dayType,
    strengthDone: rows.strengthDone,
    strengthOpen: rows.strengthOpen,
    hasStartedSession: rows.hasStartedAny,
  };
}
