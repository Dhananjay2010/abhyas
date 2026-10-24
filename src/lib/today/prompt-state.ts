/**
 * Pure decision function that returns which single prompt (if any) Today shows.
 * Ensures mutual exclusivity: missed, rest-day plan, or none.
 */

export type TodayPromptType = "missed" | "rest_plan" | "none";

export interface TodayPromptInput {
  missedYesterday: boolean;
  dayType: string | null;
  hasStartedSession: boolean;
  answeredToday: boolean;
  strengthDone: boolean;
  strengthOpen: boolean;
}

export function decideTodayPrompt(input: TodayPromptInput): TodayPromptType {
  const {
    missedYesterday,
    dayType,
    hasStartedSession,
    answeredToday,
    strengthDone,
    strengthOpen,
  } = input;

  // No prompts after a session is finished or one is open
  if (strengthDone || strengthOpen) {
    return "none";
  }

  // First day (never started a session) on a rest day gets no missed prompt
  // This is handled in the rest_plan case below

  // Missed yesterday takes priority over rest-day plan
  if (missedYesterday && !answeredToday) {
    // But on the first day ever, don't show missed prompt
    if (!hasStartedSession) {
      return "none";
    }
    return "missed";
  }

  // Rest day shows the "train anyway" prompt
  if (dayType === "rest") {
    return "rest_plan";
  }

  return "none";
}
