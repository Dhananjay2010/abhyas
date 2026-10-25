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
import { addDays, isoWeekday } from "@/lib/dates";
import { labelForDayType } from "@/lib/program/day-plan";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";
import { attachWorkingSetCounts } from "./yesterday-sessions";
import { buildPageState } from "./page-wiring";
import { buildTodayView } from "./page-helpers";
import { buildTodayState } from "./build-state";
import { todayPromptBlocks } from "./prompt-blocks";
import { buildTrainAnywayDays } from "./train-anyway";
import { pulledForwardDays, pulledForwardLabel, pulledForwardMessage } from "./pulled-forward";

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

  weekSessionsRes: {
    data: Array<{
      id: string;
      local_date: string;
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
      program_day_id: string | null;
      started_at: string | null;
      created_at: string | null;
    }> | null;
    error: Error | null;
  };

  todaySessionsRes: {
    data: Array<{
      id: string;
      local_date: string;
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
      program_day_id: string | null;
      started_at: string | null;
      created_at: string | null;
    }> | null;
    error: Error | null;
  };

  yesterdaySessionsRes: {
    data: Array<{
      id: string;
      local_date: string;
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

  // Today's day info (derived from override or template)
  override: {
    id: string;
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    program_day_id: string | null;
    started_at: string | null;
    created_at: string | null;
  } | undefined;
  
  overrideDay: {
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  } | undefined;
  
  scheduled: {
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  } | null;
  
  today: {
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  } | null;
  
  dayType: DayType | null;
  dayLabel: string;
  overrideDiffers: boolean;
  pulledForwardMessage: string | null;

  // Session state
  strengthDone: boolean;
  strengthOpen: {
    id: string;
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    program_day_id: string | null;
    started_at: string | null;
    created_at: string | null;
  } | undefined;
  
  performed: {
    id: string;
    status: string;
    actual_type: DayType | null;
    program_id: string | null;
    program_day_id: string | null;
    started_at: string | null;
    created_at: string | null;
  } | undefined;

  // Plannable days flag
  needsPlannableDays: boolean;
  
  // Pulled forward tracking
  pulledForward: Map<string, { programDayId: string }>;
};

export function buildPage(input: BuildPageInput): BuildPageOutput {
  const {
    profile,
    program,
    days,
    allSessionsRes,
    weekSessionsRes,
    todaySessionsRes,
    yesterdaySessionsRes,
    sessionExercisesRes,
    timezone,
    localToday,
    yesterday,
  } = input;

  // Filter yesterday's sessions to program sessions on yesterday's date
  // If sessions query errored, treat yesterday as unknown (pass null)
  const yesterdayProgramSessions = yesterdaySessionsRes.error
    ? null
    : yesterdaySessionsRes.data?.filter((s) => s.local_date === yesterday && s.program_id === program.id) ?? [];

  // Attach working set counts to yesterday's sessions
  const yesterdaySessionsWithCounts = yesterdayProgramSessions === null
    ? null
    : attachWorkingSetCounts(sessionExercisesRes, yesterdayProgramSessions);

  // Today's sessions (filtered to today's date only)
  const todaySessions = todaySessionsRes.data?.filter(
    (s) => s.local_date === localToday
  ) ?? [];

  // Compute pulled-forward days (completed/in-progress on earlier rest days this cycle week)
  const weekSessions = weekSessionsRes.data ?? [];
  const pulledForward = pulledForwardDays({
    program: { started_on: program.started_on, week_offset: program.week_offset },
    days,
    sessions: weekSessions,
    localToday,
  });
  
  // Determine today's scheduled day from the template
  const todayIndex = isoWeekday(localToday);
  let scheduled = days.find((d) => d.day_index === todayIndex) ?? null;
  
  // Check if today's scheduled program_day was pulled forward
  const todayPulledForward = scheduled && pulledForward.has(scheduled.id)
    ? pulledForward.get(scheduled.id)!
    : null;
  
  if (todayPulledForward) {
    scheduled = null; // Today becomes rest
  }

  // Which of today's session rows speaks for the day
  const ownsToday = (s: typeof todaySessions[number]) =>
    s.actual_type !== null &&
    (s.status === "planned" ||
      (ownsPlannedWorkout(s.actual_type) &&
        (s.status === "in_progress" || s.status === "completed" || s.status === "skipped")));

  const OWNER_RANK: Record<string, number> = {
    completed: 0,
    in_progress: 1,
    planned: 2,
    skipped: 3,
  };

  const override = todaySessions
    .filter(ownsToday)
    .sort(
      (a, b) =>
        (OWNER_RANK[a.status] ?? 9) - (OWNER_RANK[b.status] ?? 9) ||
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    )[0];

  const overrideDay = override?.program_day_id
    ? days.find((d) => d.id === override.program_day_id)
    : undefined;

  const today = overrideDay ?? scheduled;
  let dayType = override?.actual_type ?? scheduled?.day_type ?? null;
  
  // If today's scheduled workout was pulled forward and completed earlier this week, treat as rest
  if (todayPulledForward && !override) {
    dayType = "rest";
  }
  
  let dayLabel = labelForDayType(dayType ?? "rest", today?.label ?? null);
  let pulledForwardMessageText: string | null = null;
  
  // If today's scheduled workout was pulled forward and completed earlier this week, show special label
  if (todayPulledForward && !override) {
    dayLabel = pulledForwardLabel(todayPulledForward);
    pulledForwardMessageText = pulledForwardMessage(todayPulledForward);
  }

  const overrideDiffers =
    override !== undefined &&
    (override.actual_type !== (scheduled?.day_type ?? null) ||
      (overrideDay !== undefined && overrideDay.id !== (scheduled?.id ?? null)));

  const strengthDone = todaySessions.some(
    (s) => s.status === "completed" && ownsPlannedWorkout(s.actual_type),
  );

  const strengthOpen = todaySessions.find(
    (s) => (s.status === "in_progress" || s.status === "planned") && ownsPlannedWorkout(s.actual_type),
  );

  const performed =
    override &&
    ownsPlannedWorkout(override.actual_type) &&
    (override.status === "completed" || override.started_at !== null)
      ? override
      : undefined;

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
    strengthOpen: !!strengthOpen,
    pulledForwardDayIds: pulledForward,
  });

  const { hasStartedAny, todayStateInput } = pageState;

  // Build chosen days map
  // For each day in the week, check if there's a planned/in_progress session
  // that differs from the template, and store its label
  const chosenByDayIndex = new Map<number, string>();
  for (const d of days) {
    // The next time this weekday comes round, which is today for today
    const date = addDays(localToday, (d.day_index - todayIndex + 7) % 7);
    const sess = weekSessions.find(
      (x) =>
        x.local_date === date &&
        (x.status === "planned" || x.status === "in_progress") &&
        x.actual_type !== null,
    );
    if (!sess?.actual_type) continue;
    const chosenDay = sess.program_day_id
      ? days.find((pd) => pd.id === sess.program_day_id)
      : undefined;
    const label = labelForDayType(sess.actual_type, chosenDay?.label ?? null);
    if (label !== d.label) chosenByDayIndex.set(d.day_index, label);
  }
  
  // Check for pulled-forward days: if a program_day was completed/in-progress earlier this week
  // on a rest day, its original weekday shows "Done <Day> (your choice)"
  for (const d of days) {
    if (d.day_type === "rest") continue;
    
    const pulledInfo = pulledForward.get(d.id);
    if (pulledInfo) {
      chosenByDayIndex.set(d.day_index, pulledForwardLabel(pulledInfo));
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
  const yesterdayIndex = isoWeekday(yesterday);
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
    pulledForwardDayIds: pulledForward,
    program: {
      started_on: program.started_on,
      week_offset: program.week_offset,
    },
  });

  // Determine if we need plannable days (for prompts)
  const needsPlannableDays =
    (dayType === "rest" || missedYesterday) && !strengthDone && !strengthOpen;

  return {
    todayView,
    todayState,
    promptBlocks,
    trainAnywayDays,
    yesterdayDay,
    override,
    overrideDay,
    scheduled,
    today,
    dayType,
    dayLabel,
    overrideDiffers,
    pulledForwardMessage: pulledForwardMessageText,
    pulledForward,
    strengthDone,
    strengthOpen,
    performed,
    needsPlannableDays,
  };
}
