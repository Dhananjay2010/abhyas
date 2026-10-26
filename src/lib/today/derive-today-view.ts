import type { Database } from "@/lib/database.types";
import { decideTodayPrompts } from "@/lib/today/decide-today-prompts";
import { decideRestDayResume } from "@/lib/today/rest-day-resume";
import { shouldLoadPlannableDays } from "@/lib/today/should-load-plannable";
import { buildChosenByDayIndex } from "@/lib/today/chosen-by-day";
import type { SessionForDetection } from "@/lib/today/session-detection";

type TodayViewInput = {
  dayType: Database["public"]["Enums"]["day_type"];
  missedYesterday: boolean;
  strengthDone: boolean;
  strengthOpen: SessionForDetection | undefined;
  todaySessions: Array<{
    status: string;
    actual_type: Database["public"]["Enums"]["day_type"] | null;
  }>;
  yesterdayDay: { day_type: Database["public"]["Enums"]["day_type"]; label: string | null } | undefined;
  localToday: string;
  todayIndex: number;
  allSessions: Array<{
    local_date: string;
    status: string;
    actual_type: Database["public"]["Enums"]["day_type"] | null;
    program_day_id: string | null;
    created_at?: string | null;
  }>;
  days: Array<{
    id: string;
    day_index: number;
    day_type: Database["public"]["Enums"]["day_type"];
    label: string | null;
  }>;
};

type TodayViewResult = {
  prompt:
    | { type: "missed-yesterday"; heading: string; intro: string }
    | { type: "rest-day-swap"; heading: string; intro: string }
    | null;
  offerRest: boolean;
  showResume: boolean;
  showSwap: boolean;
  resumeButton:
    | { type: "link"; href: string }
    | { type: "form"; label: string }
    | null;
  shouldLoadPlannableDays: boolean;
  chosenByDayIndex: Map<number, string>;
};

export function deriveTodayView(input: TodayViewInput): TodayViewResult {
  const {
    dayType,
    missedYesterday,
    strengthDone,
    strengthOpen,
    todaySessions,
    yesterdayDay,
    localToday,
    todayIndex,
    allSessions,
    days,
  } = input;

  const promptDecision = decideTodayPrompts({
    missedYesterday,
    strengthDone,
    strengthOpen,
    dayType,
    todaySessions,
    yesterdayDay,
  });

  const resumeDecision = decideRestDayResume({
    dayType,
    strengthOpen,
    localToday,
  });

  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;
  const needPlannableDays = shouldLoadPlannableDays({
    askAboutToday,
    dayType,
  });

  const chosenByDayIndex = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);

  return {
    prompt: promptDecision.prompt,
    offerRest: promptDecision.offerRest,
    showResume: resumeDecision.showResume,
    showSwap: resumeDecision.showSwap,
    resumeButton: resumeDecision.resumeButton,
    shouldLoadPlannableDays: needPlannableDays,
    chosenByDayIndex,
  };
}
