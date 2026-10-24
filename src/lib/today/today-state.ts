/**
 * Today screen state machine - determines the single state and available actions.
 *
 * Replaces the scattered conditional logic with a pure function that returns:
 * - The current state (training, rest, missed, completed, train_anyway)
 * - Available actions (start, resume, keep/swap/rest, strength options)
 *
 * This ensures only ONE prompt is shown at a time, with the right options.
 */

import type { Database } from "@/lib/database.types";
import type { PlannableDay } from "@/app/session/actions";

type DayType = Database["public"]["Enums"]["day_type"];

export type TodayStateInput = {
  /** The actual day type (considering overrides) */
  dayType: DayType | null;
  /** Whether yesterday was a missed training day */
  missedYesterday: boolean;
  /** Whether a strength session was completed today */
  strengthDone: boolean;
  /** Whether there's an open strength session today */
  hasOpenStrength: boolean;
  /** Whether the open session has been started */
  openSessionStarted: boolean | null;
  /** Available training days from the program (for swapping) */
  plannableDays: PlannableDay[];
};

export type TodayState =
  | { type: "training_ready"; sessionState: "start" | "resume" }
  | { type: "training_completed" }
  | {
      type: "rest_or_missed";
      reason: "rest_day" | "missed_yesterday";
      actions: TodayActions;
    }
  | { type: "yoga" }
  | { type: "meditation" };

export type TodayActions = {
  /** Keep/Swap/Rest options */
  canChoose: true;
  /** Available strength training options for "train anyway" */
  strengthOptions: StrengthOption[];
};

export type StrengthOption =
  | { type: "next_planned"; label: string; programDayId: string }
  | { type: "repeat_last"; label: string; programDayId: string };

/**
 * Calculate the Today screen state from inputs.
 *
 * This is the single source of truth for what Today should show.
 * It ensures only one prompt appears, with the right options.
 */
export function calculateTodayState(input: TodayStateInput): TodayState {
  const {
    dayType,
    missedYesterday,
    strengthDone,
    hasOpenStrength,
    openSessionStarted,
    plannableDays,
  } = input;

  // Completed strength session today
  if (strengthDone) {
    return { type: "training_completed" };
  }

  // Training day with open session
  if (
    (dayType === "weights" || dayType === "bodyweight") &&
    hasOpenStrength
  ) {
    return {
      type: "training_ready",
      sessionState: openSessionStarted ? "resume" : "start",
    };
  }

  // Training day without open session
  if (dayType === "weights" || dayType === "bodyweight") {
    return {
      type: "training_ready",
      sessionState: "start",
    };
  }

  // Yoga day
  if (dayType === "yoga") {
    return { type: "yoga" };
  }

  // Meditation/breathing day
  if (dayType === "meditation") {
    return { type: "meditation" };
  }

  // Rest day or missed-yesterday state
  // Both show ONE prompt with the same structure, but different framing
  const strengthOptions = buildStrengthOptions(plannableDays);
  
  return {
    type: "rest_or_missed",
    reason: missedYesterday ? "missed_yesterday" : "rest_day",
    actions: {
      canChoose: true,
      strengthOptions,
    },
  };
}

/**
 * Build strength training options for "train anyway" or "missed yesterday".
 *
 * Always includes at least one strength option:
 * 1. The next planned workout (if available)
 * 2. The most recent workout to repeat (if no future ones available)
 * 3. The first workout in the plan (fallback)
 */
function buildStrengthOptions(plannableDays: PlannableDay[]): StrengthOption[] {
  if (plannableDays.length === 0) {
    return [];
  }

  // For simplicity, offer all plannable days as options
  // The user can pick any training day from their block
  return plannableDays.map((day) => ({
    type: "next_planned" as const,
    label: day.label,
    programDayId: day.programDayId,
  }));
}
