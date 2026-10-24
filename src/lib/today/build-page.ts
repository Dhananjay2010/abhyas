/**
 * Build complete Today page state from raw DB query results.
 * 
 * Consolidates all page-level derivation:
 * - Yesterday sessions filtering
 * - Sets result handling (including errored reads)
 * - needsPlannableDays calculation
 * - chosenByDayIndex loop
 * - Building inputs for buildTodayView, buildTodayState, todayPromptBlocks
 * 
 * Pure function - no DB queries, only transformation.
 */

import type { Database } from "@/lib/database.types";
import { attachWorkingSetCounts } from "./yesterday-sessions";
import { buildPageState } from "./page-wiring";
import { buildTodayView } from "./page-helpers";
import { buildTodayState } from "./build-state";
import { todayPromptBlocks } from "./prompt-blocks";
import { buildTrainAnywayDays } from "./train-anyway";

type DayType = Database["public"]["Enums"]["day_type"];

export type BuildPageInput = {
  // Profile data
  profile: {
    id: string;
    created_at: string | null;
    timezone: string | null;
  };

  // Program data
  program: {
    id: string;
    started_on: string;
    week_offset: number;
    deload_week: number | null;
  };

  // Program days
  days: Array<{
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  }>;

  // Session queries
  allSessionsRes: {
    data: Array<{
      actual_type: DayType | null;
      started_at: string | null;
    }> | null;
    error: Error | null;
  };

  todaySessionsRes: {
    data: Array<{
      id: string;
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
      started_at: string | null;
    }> | null;
    error: Error | null;
  };

  yesterdaySessionsRes: {
    data: Array<{
      id: string;
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
    }> | null;
    error: Error | null;
  };

  sessionExercisesRes: {
    data: Array<{
      session_id: string;
      session_sets: Array<{
        is_warmup_set: boolean;
        reps: number | null;
        duration_seconds: number | null;
      }>;
    }> | null;
    error: Error | null;
  };

  // Date context
  timezone: string;
  localToday: string;
  yesterday: string;

  // Day type
  dayType: DayType | null;

  // Session state
  strengthDone: boolean;
  strengthOpen: boolean;
};

export type BuildPageOutput = {
  // View data
  todayView: ReturnType<typeof buildTodayView>;

  // State data
  todayState: ReturnType<typeof buildTodayState>;

  // Prompt data
  promptBlocks: ReturnType<typeof todayPromptBlocks>;

  // Train anyway days
  trainAnywayDays: ReturnType<typeof buildTrainAnywayDays>;

  // Yesterday data
  yesterdayDay: {
    day_index: number;
    day_type: DayType;
    label: string | null;
  } | null;

  // First training day
  firstTrainingDay: {
    dayIndex: number;
    dayType: DayType;
    label: string | null;
    programDayId: string;
  } | null;

  // Plannable days (for missed or rest-day prompts)
  plannable: Array<{
    id: string;
    day_type: DayType;
    label: string | null;
  }>;

  // Helper outputs
  hasStartedAny: boolean | null;
};

export function buildPage(input: BuildPageInput): BuildPageOutput {
  const {
    profile,
    program,
    days,
    allSessionsRes,
    todaySessionsRes,
    yesterdaySessionsRes,
    sessionExercisesRes,
    timezone,
    localToday,
    yesterday,
    dayType,
    strengthDone,
    strengthOpen,
  } = input;

  // Filter yesterday's sessions to program sessions only
  const yesterdayProgramSessions =
    yesterdaySessionsRes.data?.filter((s) => s.program_id === program.id) ?? [];

  // Attach working set counts to yesterday's sessions
  const yesterdaySessionsWithCounts = attachWorkingSetCounts(
    sessionExercisesRes,
    yesterdayProgramSessions
  );

  // Today's sessions
  const todaySessions = todaySessionsRes.data?.filter(
    (s) => s.program_id === program.id
  ) ?? [];

  // Build page state (handles errored reads via yesterdayUnknown flag)
  const pageState = buildPageState({
    profile,
    program,
    days,
    allSessionsRes,
    todaySessions,
    yesterdaySessions: yesterdaySessionsWithCounts,
    timezone,
    localToday,
    yesterday,
    dayType,
    strengthDone,
    strengthOpen,
  });

  const { hasStartedAny, todayStateInput } = pageState;

  // Determine if we need plannable days (for prompts)
  const needsPlannableDays =
    dayType === "rest" || dayType === null || yesterdaySessionsWithCounts === null;

  // Build chosen days map
  const chosenByDayIndex = new Map<number, string>();
  for (const s of todaySessions) {
    if (s.actual_type && s.actual_type !== "rest") {
      const dayMatch = days.find(
        (d) => d.day_type === s.actual_type && d.day_index !== 0
      );
      if (dayMatch) {
        chosenByDayIndex.set(dayMatch.day_index, dayMatch.id);
      }
    }
  }

  // Build today view
  const todayView = buildTodayView({
    program: {
      started_on: program.started_on,
      week_offset: program.week_offset,
      deload_week: program.deload_week,
    },
    localToday,
    days,
    hasStartedAny,
    chosenByDayIndex,
  });

  // Build today state
  const todayState = buildTodayState(todayStateInput);

  const { promptType, missedYesterday, isTraining, nextTrainingDay } = todayState;

  // Yesterday day info
  const yesterdayIndex = new Date(yesterday + "T12:00:00Z").getDay() || 7;
  const yesterdayDay = days.find((d) => d.day_index === yesterdayIndex) ?? null;

  // Build prompt blocks
  const promptBlocks = todayPromptBlocks({
    promptType,
    missedYesterday,
    hasStartedAny,
    nextTrainingDay,
    isTraining,
    firstTrainingDay: todayView.firstTrainingDay,
  });

  // Build train-anyway days (for rest-day or missed prompts)
  const trainAnywayDays = buildTrainAnywayDays({
    allDays: days,
    localToday,
    missedYesterday,
  });

  // Plannable days
  const plannable = needsPlannableDays
    ? days.filter((d) => d.day_index !== 0)
    : [];

  return {
    todayView,
    todayState,
    promptBlocks,
    trainAnywayDays,
    yesterdayDay,
    firstTrainingDay: todayView.firstTrainingDay,
    plannable,
    hasStartedAny,
  };
}
