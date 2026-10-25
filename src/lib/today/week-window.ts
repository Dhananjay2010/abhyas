/**
 * Compute the session query window for Today page.
 *
 * To catch pull-forwards done earlier in the cycle week, the window must start
 * at the cycle week's first day (not yesterday). It extends through today+6 to
 * cover "Your week" choices.
 */

import { addDays, daysBetween } from "@/lib/dates";

export interface WeekWindowInput {
  started_on: string;
  week_offset: number;
}

export interface WeekWindow {
  start: string;
  end: string;
}

/**
 * Compute the session window from cycle-week start through today+6.
 */
export function weekWindow(program: WeekWindowInput, localToday: string): WeekWindow {
  const { started_on } = program;
  
  // Calculate the week start directly from started_on and today
  // This avoids double-counting week_offset (cycleWeekFor already includes it)
  const daysSinceStart = daysBetween(started_on, localToday);
  const weeksElapsed = Math.floor(daysSinceStart / 7);
  
  // Start of the current week, clamped to started_on (when weeksElapsed < 0)
  const start = weeksElapsed >= 0 ? addDays(started_on, weeksElapsed * 7) : started_on;
  
  // Window extends from cycle week start through today+6 (for "Your week")
  const end = addDays(localToday, 6);
  
  return {
    start,
    end,
  };
}
