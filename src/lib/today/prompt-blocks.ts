/**
 * Pure function to decide which prompt blocks render on Today.
 * Returns which UI blocks to show: missed prompt, Keep/Swap/Rest, first-day welcome, etc.
 */

import type { TodayPromptType } from "./prompt-state";

export interface PromptBlocksInput {
  promptType: TodayPromptType;
  missedYesterday: boolean;
  hasStartedAny: boolean;
  nextTrainingDay: { dayName: string; dayIndex: number } | null;
}

export interface PromptBlocks {
  showMissedPrompt: boolean;
  showKeepSwapRest: boolean;
  showRestPlan: boolean;
  showBothPrompt: boolean;
  showFirstDayWelcome: boolean;
  showStartFirstWorkoutAnyway: boolean;
}

export function todayPromptBlocks(input: PromptBlocksInput): PromptBlocks {
  const { promptType, hasStartedAny, nextTrainingDay } = input;

  const neverStarted = !hasStartedAny;

  // "both" state: rest day with missed yesterday
  if (promptType === "both") {
    return {
      showMissedPrompt: false,
      showKeepSwapRest: false,
      showRestPlan: true,
      showBothPrompt: true,
      showFirstDayWelcome: false,
      showStartFirstWorkoutAnyway: false,
    };
  }

  // Missed yesterday (not on rest day)
  if (promptType === "missed") {
    return {
      showMissedPrompt: true,
      showKeepSwapRest: false,
      showRestPlan: false,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showStartFirstWorkoutAnyway: false,
    };
  }

  // Rest day (no missed yesterday)
  if (promptType === "rest_plan") {
    // First day on a rest day: show next training day
    if (neverStarted && nextTrainingDay) {
      return {
        showMissedPrompt: false,
        showKeepSwapRest: false,
        showRestPlan: true,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showStartFirstWorkoutAnyway: true,
      };
    }

    // Normal rest day
    return {
      showMissedPrompt: false,
      showKeepSwapRest: false,
      showRestPlan: true,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showStartFirstWorkoutAnyway: false,
    };
  }

  // No prompt (training day or answered already)
  return {
    showMissedPrompt: false,
    showKeepSwapRest: false,
    showRestPlan: false,
    showBothPrompt: false,
    showFirstDayWelcome: false,
    showStartFirstWorkoutAnyway: false,
  };
}
