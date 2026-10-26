import type { Database } from "@/lib/database.types";
import { decideTodayPrompts } from "@/lib/today/decide-today-prompts";
import { decideRestDayResume } from "@/lib/today/rest-day-resume";
import { shouldLoadPlannableDays } from "@/lib/today/should-load-plannable";
import { buildChosenByDayIndex } from "@/lib/today/chosen-by-day";
import type { SessionForDetection } from "@/lib/today/session-detection";

type TodayViewInput = {
  dayType: Database["public"]["Enums"]["day_type"];
    10|  missedYesterday: boolean;
  strengthDone: boolean;
  strengthOpen: SessionForDetection | undefined;
  todaySessions: Array<{
    status: string;
    actual_type: Database["public"]["Enums"]["day_type"] | null;
  }>;
  yesterdayDay: { day_type: Database["public"]["Enums"]["day_type"]; label: string | null } | undefined;
  localToday: string;
  todayIndex: number;
    20|  allSessions: Array<{
    local_date: string;
    status: string;
    actual_type: Database["public"]["Enums"]["day_type"] | null;
    program_day_id: string | null;
    created_at?: string | null;
  }>;
  days: Array<{
    id: string;
    day_index: number;
    30|    day_type: Database["public"]["Enums"]["day_type"];
    label: string | null;
  }>;
};

type TodayViewResult = {
  /** Which single prompt to show (missed-yesterday or rest-day-swap), or null */
  prompt:
    | { type: "missed-yesterday"; heading: string; intro: string }
    | { type: "rest-day-swap"; heading: string; intro: string }
    40|    | null;
  /** Whether the prompt should offer a Rest option */
  offerRest: boolean;
  /** Whether to show the Resume button (for open strength on rest day) */
  showResume: boolean;
  /** Whether to show the rest-day swap prompt */
  showSwap: boolean;
  /** Resume button details (link or form) */
  resumeButton:
    | { type: "link"; href: string }
    50|    | { type: "form"; label: string }
    | null;
  /** Whether to load plannable days (for swap prompts) */
  shouldLoadPlannableDays: boolean;
  /** Map of weekday index → chosen label for "Your week" */
  chosenByDayIndex: Map<number, string>;
};

/**
 * Consolidate all Today page decision logic into one pure function.
    60| *
 * This wraps decideTodayPrompts, decideRestDayResume, shouldLoadPlannableDays,
 * and buildChosenByDayIndex, returning everything page.tsx needs to render.
 *
 * Single prompt logic, Resume button visibility, plannable days loading,
 * and "Your week" map are all derived here. The page renders from this result.
 */
export function deriveTodayView(input: TodayViewInput): TodayViewResult {
  const {
    70|    dayType,
    missedYesterday,
    strengthDone,
    strengthOpen,
    todaySessions,
    yesterdayDay,
    localToday,
    todayIndex,
    allSessions,
    days,
    80|  } = input;

  // 1. Decide which single day-plan prompt to show
  const promptDecision = decideTodayPrompts({
    missedYesterday,
    strengthDone,
    strengthOpen,
    dayType,
    todaySessions,
    yesterdayDay,
    90|  });

  // 2. Decide rest-day resume button behavior
  const resumeDecision = decideRestDayResume({
    dayType,
    strengthOpen,
    localToday,
  });

  // 3. Decide whether to load plannable days
  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;
   100|  const needPlannableDays = shouldLoadPlannableDays({
    askAboutToday,
    dayType,
  });

  // 4. Build the "Your week" chosen-by-day-index map
  const chosenByDayIndex = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);

  return {
    prompt: promptDecision.prompt,
   110|    offerRest: promptDecision.offerRest,
    showResume: resumeDecision.showResume,
    showSwap: resumeDecision.showSwap,
    resumeButton: resumeDecision.resumeButton,
    shouldLoadPlannableDays: needPlannableDays,
    chosenByDayIndex,
  };
}
