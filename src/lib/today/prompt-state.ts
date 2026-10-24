/**
 * Pure decision function that returns which single prompt (if any) Today shows.
 * Returns "missed", "rest_plan", "both" (rest day with missed yesterday), or "none".
 * 
 * The started_on and onboarding checks in isMissedTrainingDay already handle day 1,
 * so hasStartedSession is NOT needed here.
 */

export type TodayPromptType = "missed" | "rest_plan" | "both" | "none";

export interface TodayPromptInput {
  missedYesterday: boolean;
  dayType: string | null;
  answeredToday: boolean;
  strengthDone: boolean;
  strengthOpen: boolean;
}

export function decideTodayPrompt(input: TodayPromptInput): TodayPromptType {
  const {
    missedYesterday,
    dayType,
    answeredToday,
    strengthDone,
    strengthOpen,
  } = input;

  // No prompts after a session is finished or one is open
  if (strengthDone || strengthOpen) {
    return "none";
  }

  const isRestDay = dayType === "rest";
  const showMissed = missedYesterday && !answeredToday;

  // Rest day with missed yesterday: show both (missed prompt + rest content)
  if (isRestDay && showMissed) {
    return "both";
  }

  // Missed yesterday (not on a rest day)
  if (showMissed) {
    return "missed";
  }

  // Rest day (no missed yesterday)
  if (isRestDay) {
    return "rest_plan";
  }

  return "none";
}
