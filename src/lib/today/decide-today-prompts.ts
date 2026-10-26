import type { Database } from "@/lib/database.types";
import type { SessionForDetection } from "@/lib/today/session-detection";

type TodayPromptDecision = {
  /** Which prompt (if any) should be shown. Only one at a time. */
  prompt:
    | { type: "missed-yesterday"; heading: string; intro: string }
    | { type: "rest-day-swap"; heading: string; intro: string }
    | null;
  /** Whether the prompt should offer a Rest option. Never when day is already Rest. */
  offerRest: boolean;
};

/**
 * Decide which single day-plan prompt (if any) to show on the Today page.
 *
 * Rules:
 * 1. At most one prompt is ever shown.
 * 2. Once the user has decided for today (a user-chosen planned row exists),
 *    the missed-yesterday prompt doesn't come back.
 * 3. Never offer Rest when the day is already Rest.
 * 4. Priority: missed-yesterday prompt first (if applicable), then rest-day swap.
 *
 * @param input.missedYesterday - True when yesterday's training day was not completed
 * @param input.strengthDone - True when today has a completed strength session
 * @param input.strengthOpen - Open strength session (from any date)
 * @param input.dayType - Today's day type (after any overrides)
 * @param input.todaySessions - All sessions for today (to detect user choices)
 * @param input.yesterdayDay - Yesterday's program day (for the intro text)
 * @returns Decision about which prompt to show and whether to offer Rest
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
  const { missedYesterday, strengthDone, strengthOpen, dayType, todaySessions, yesterdayDay } = input;

  // Has the user already made a choice for today? (planned row exists)
  const userHasChosenToday = todaySessions.some((s) => s.status === "planned");

  // Should we ask about today due to missed yesterday?
  // Only ask if:
  // - Yesterday was missed
  // - No strength session done or open today
  // - User hasn't already made a choice for today
  const shouldAskMissedYesterday = missedYesterday && !strengthDone && !strengthOpen && !userHasChosenToday;

  // Should we show the rest-day swap prompt?
  // Only show if:
  // - Today is a rest day
  // - No strength session is open (handled by decideRestDayResume's showSwap)
  // - Not also showing the missed-yesterday prompt (priority)
  // - User hasn't already made a choice for today
  const shouldShowRestDaySwap = dayType === "rest" && !strengthOpen && !shouldAskMissedYesterday && !userHasChosenToday;

  // Never offer Rest when the day is already Rest
  const offerRest = dayType !== "rest";

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
      offerRest,
    };
  }

  if (shouldShowRestDaySwap) {
    return {
      prompt: {
        type: "rest-day-swap",
        heading: "Or train today anyway",
        intro: "Pick what you'd like to do instead.",
      },
      offerRest,
    };
  }

  return {
    prompt: null,
    offerRest: false,
  };
}
