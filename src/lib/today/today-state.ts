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
  | { type: "training_ready"; sessionState: "start" | "resume"; missedYesterday: boolean }
  | { type: "training_completed"; missedYesterday: boolean }
  | {
      type: "rest_or_missed";
      reason: "rest_day" | "missed_yesterday";
    }
  | { type: "yoga"; missedYesterday: boolean }
  | { type: "meditation"; missedYesterday: boolean };

/**
 * Calculate the Today screen state from inputs.
 *
 * This is the single source of truth for what Today should show.
 * Missed-yesterday is shown on ALL day types when true.
 */
export function calculateTodayState(input: TodayStateInput): TodayState {
  const {
    dayType,
    missedYesterday,
    strengthDone,
    hasOpenStrength,
    openSessionStarted,
  } = input;

  // Completed strength session today
  if (strengthDone) {
    return { type: "training_completed", missedYesterday };
  }

  // Training day with open session
  if (
    (dayType === "weights" || dayType === "bodyweight") &&
    hasOpenStrength
  ) {
    return {
      type: "training_ready",
      sessionState: openSessionStarted ? "resume" : "start",
      missedYesterday,
    };
  }

  // Training day without open session
  if (dayType === "weights" || dayType === "bodyweight") {
    return {
      type: "training_ready",
      sessionState: "start",
      missedYesterday,
    };
  }

  // Yoga day
  if (dayType === "yoga") {
    return { type: "yoga", missedYesterday };
  }

  // Meditation/breathing day
  if (dayType === "meditation") {
    return { type: "meditation", missedYesterday };
  }

  // Rest day (missed_yesterday handled via return value, not state type)
  return {
    type: "rest_or_missed",
    reason: missedYesterday ? "missed_yesterday" : "rest_day",
  };
}

