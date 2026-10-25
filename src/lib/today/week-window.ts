/**
 * Compute the session query window for Today page.
 *
 * To catch pull-forwards done earlier in the cycle week, the window must start
 * at the cycle week's first day (not yesterday). It extends through today+6 to
 * cover "Your week" choices.
 */

import { addDays, isoWeekday } from "@/lib/dates";
import { cycleWeekFor } from "@/lib/program/block-range";

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
  // Find which cycle week today is in
  const cycleWeek = cycleWeekFor(program, localToday);
  
  // Compute the first day of this cycle week
  // cycleWeek=1 starts on started_on, cycleWeek=2 starts 7 days later, etc.
  // Each cycle week starts on the same weekday as started_on
  const weeksFromStart = cycleWeek - 1;
  const start = addDays(program.started_on, weeksFromStart * 7);
  
  // Window extends from cycle week start through today+6 (for "Your week")
  const end = addDays(localToday, 6);
  
  return {
    start,
    end,
  };
}
