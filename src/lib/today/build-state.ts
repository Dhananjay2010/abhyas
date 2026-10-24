/**
 * Pure state builder for the Today page.
 *
 * Consolidates all Today logic inputs and derives:
 * - promptType: which prompt to show ("missed", "rest_plan", "both", "none")
 * - missedYesterday: whether yesterday was missed
 * - answeredToday: whether today has been answered
 * - isTraining: whether today is a strength training day
 * - todayExercises: the exercises to display
 * - nextTrainingDay: for first-day rest day
 *
 * All date/timezone handling and decision logic lives here, not in page.tsx.
 */

import { isoWeekday } from "@/lib/dates";
import { isMissedTrainingDay } from "./missed-day";
import { decideTodayPrompt, type TodayPromptType } from "./prompt-state";
import { isTodayAnswered } from "./answered";
import { nextTrainingDay as findNextTrainingDay } from "./next-training-day";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export interface BuildTodayStateInput {
  // User profile data
  profile: {
    created_at: string | null;
    timezone: string | null;
  };

  // Program data
  program: {
    id: string;
    started_on: string;
  };

  // Days (template)
  days: Array<{
    day_index: number;
    day_type: DayType;
    label: string | null;
  }>;

  // Sessions data
  sessions: {
    today: Array<{
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
      started_at: string | null;
    }>;
    yesterday: Array<{
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
    }>;
  };

  // Current date and timezone
  timezone: string;
  localToday: string;
  yesterday: string;

  // Derived day info
  dayType: DayType | null;

  // Session state
  strengthDone: boolean;
  strengthOpen: boolean;
  hasStartedSession: boolean;
}

export interface BuildTodayStateOutput {
  promptType: TodayPromptType;
  missedYesterday: boolean;
  answeredToday: boolean;
  isTraining: boolean;
  nextTrainingDay: { dayName: string; dayIndex: number } | null;
}

export function buildTodayState(input: BuildTodayStateInput): BuildTodayStateOutput {
  const {
    profile,
    program,
    days,
    sessions,
    timezone,
    localToday,
    yesterday,
    dayType,
    strengthDone,
    strengthOpen,
    hasStartedSession,
  } = input;

  const yesterdayIndex = isoWeekday(yesterday);
  const yesterdayDay = days.find((d) => d.day_index === yesterdayIndex);

  // Check if yesterday was missed
  const missedYesterday = isMissedTrainingDay({
    date: yesterday,
    programStartedOn: program.started_on,
    profileCreatedAt: profile.created_at,
    timezone,
    templateDayType: yesterdayDay?.day_type ?? null,
    programId: program.id,
    sessions: sessions.yesterday.map((s) => ({
      actual_type: s.actual_type,
      status: s.status,
      program_id: s.program_id,
    })),
    hasStartedAny: hasStartedSession,
  });

  // Check if today has been answered
  const answeredToday = isTodayAnswered(
    sessions.today.map((s) => ({
      status: s.status,
      actual_type: s.actual_type,
      program_id: s.program_id,
    })),
    program.id
  );

  // Decide which prompt to show
  const promptType = decideTodayPrompt({
    missedYesterday,
    dayType,
    answeredToday,
    strengthDone,
    strengthOpen,
  });

  // Check if today is a training day
  const isTraining = dayType === "weights" || dayType === "bodyweight";

  // Find next training day for first-day rest day
  const nextTraining = !hasStartedSession && dayType === "rest"
    ? findNextTrainingDay(days, localToday)
    : null;

  return {
    promptType,
    missedYesterday,
    answeredToday,
    isTraining,
    nextTrainingDay: nextTraining,
  };
}
