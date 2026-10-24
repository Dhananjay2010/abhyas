/**
 * Pure function to decide which prompt blocks render on Today.
 * Returns which UI blocks to show: missed prompt, Keep/Swap/Rest, first-day welcome, etc.
 * 
 * NEW: First-session offer for brand-new users on rest days
 */

import type { TodayPromptType } from "./prompt-state";

export interface PromptBlocksInput {
  promptType: TodayPromptType;
  missedYesterday: boolean;
  hasStartedAny: boolean;
  nextTrainingDay: { dayName: string; dayIndex: number } | null;
  isTraining: boolean;
  firstTrainingDay?: { dayIndex: number; label: string | null } | null;
}

export interface PromptBlocks {
  showMissedPrompt: boolean;
  showRestPlan: boolean;
  showBothPrompt: boolean;
  showFirstDayWelcome: boolean;
  showFirstSessionOffer: boolean;
}

export function todayPromptBlocks(input: PromptBlocksInput): PromptBlocks {
  const { promptType, hasStartedAny, nextTrainingDay, isTraining, firstTrainingDay } = input;

  const neverStarted = !hasStartedAny;

  // Day-one guard: hide all prompts except first-day welcome for never-started users
  if (neverStarted) {
    // NEW: First-session offer on rest day: show "Your first session is <day 1>" with "Start it now"
    const showFirstSessionOffer = !isTraining && !!firstTrainingDay;
    
    // First day on a rest day with first training day available
    if (showFirstSessionOffer) {
      return {
        showMissedPrompt: false,
        showRestPlan: true,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showFirstSessionOffer: true,
      };
    }
    
    // First day on any day (rest or training): show welcome + "Start first session now" button
    if (nextTrainingDay) {
      return {
        showMissedPrompt: false,
        showRestPlan: true,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showFirstSessionOffer: false,
      };
    }

    // First day on a training day: show welcome (exercises will render normally)
    if (isTraining) {
      return {
        showMissedPrompt: false,
        showRestPlan: false,
        showBothPrompt: false,
        showFirstDayWelcome: true,
        showFirstSessionOffer: false,
      };
    }

    // Never started, not training, no prompt
    return {
      showMissedPrompt: false,
      showRestPlan: false,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    };
  }

  // "both" state: rest day with missed yesterday
  if (promptType === "both") {
    return {
      showMissedPrompt: false,
      showRestPlan: true,
      showBothPrompt: true,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    };
  }

  // Missed yesterday (not on rest day)
  if (promptType === "missed") {
    return {
      showMissedPrompt: true,
      showRestPlan: false,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    };
  }

  // Rest day (no missed yesterday)
  if (promptType === "rest_plan") {
    return {
      showMissedPrompt: false,
      showRestPlan: true,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    };
  }

  // No prompt (training day or answered already)
  return {
    showMissedPrompt: false,
    showRestPlan: false,
    showBothPrompt: false,
    showFirstDayWelcome: false,
    showFirstSessionOffer: false,
  };
}
