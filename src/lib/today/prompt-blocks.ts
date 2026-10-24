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
  isTraining: boolean;
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
  const { promptType, hasStartedAny, nextTrainingDay, isTraining } = input;

  const neverStarted = !hasStartedAny;

  // Day-one guard: hide all prompts except first-day welcome for never-started users
  if (neverStarted) {
    // First day on a rest day: show welcome + "Start first workout anyway"
    if (promptType === "rest_plan" && nextTrainingDay) {
      return {
        showMissedPrompt: false,
        showKeepSwapRest: false,
        showRestPlan: true,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showStartFirstWorkoutAnyway: true,
      };
    }

    // First day on a training day: show welcome (exercises will render normally)
    if (isTraining) {
      return {
        showMissedPrompt: false,
        showKeepSwapRest: false,
        showRestPlan: false,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showStartFirstWorkoutAnyway: false,
      };
    }

    // Never started, not training, no prompt
    return {
      showMissedPrompt: false,
      showKeepSwapRest: false,
      showRestPlan: false,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showStartFirstWorkoutAnyway: false,
    };
  }

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
