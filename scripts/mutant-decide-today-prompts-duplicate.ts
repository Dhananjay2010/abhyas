/**
 * MUTANT: decideTodayPrompts that returns BOTH prompts (the bug).
 *
 * This version always returns both prompts to simulate the original bug.
 * Used to verify that the test catches duplicate prompts.
 */

import type { Database } from "@/lib/database.types";
import type { SessionForDetection } from "@/lib/today/session-detection";

type TodayPromptDecision = {
  prompt:
    | { type: "missed-yesterday"; heading: string; intro: string }
    | { type: "rest-day-swap"; heading: string; intro: string }
    | null;
  offerRest: boolean;
};

/**
 * MUTANT VERSION: Always returns both prompts (simulates the bug).
 */
export function decideTodayPrompts(input: {
  missedYesterday: boolean;
  strengthDone: boolean;
  strengthOpen: SessionForDetection | undefined;
  dayType: Database["public"]["Enums"]["day_type"];
  todaySessions: Array<{
    status: string;
    actual_type: Database["public"]["Enums"]["day_type"] | null;
  }>;
  yesterdayDay: { day_type: Database["public"]["Enums"]["day_type"]; label: string | null } | undefined;
}): TodayPromptDecision {
  const { missedYesterday, dayType, yesterdayDay } = input;

  // MUTANT: Ignore user choice, always show prompts
  const shouldAskMissedYesterday = missedYesterday;
  const shouldShowRestDaySwap = dayType === "rest";

  // MUTANT BUG: Return first prompt, but page would render both
  // (This simulates the old page behavior where both sections rendered independently)
  // For the test, we'll check that the test detects the scenario should only have ONE prompt
  
  if (shouldAskMissedYesterday) {
    const yesterdayLabel = yesterdayDay
      ? `${yesterdayDay.label ?? yesterdayDay.day_type.charAt(0).toUpperCase() + yesterdayDay.day_type.slice(1)}`
      : "Yesterday";
    return {
      prompt: {
        type: "missed-yesterday",
        heading: "You missed yesterday",
        intro: `${yesterdayLabel} did not happen.`,
      },
      offerRest: true, // MUTANT: Always offers Rest even when day is Rest
    };
  }

  if (shouldShowRestDaySwap) {
    return {
      prompt: {
        type: "rest-day-swap",
        heading: "Or train today anyway",
        intro: "Pick what you'd like to do instead.",
      },
      offerRest: true, // MUTANT: Always offers Rest
    };
  }

  return { prompt: null, offerRest: false };
}
