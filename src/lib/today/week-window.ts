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
 * Compute the session window from min(yesterday, cycle-week start) through today+6.
 * 
 * Starting at yesterday (not just cycle-week start) ensures:
 * - Completed yesterday sessions are fetched (for missedYesterday detection)
 * - In-progress yesterday sessions show resume link (#111/#116)
 * - Programs starting tomorrow still include today
 */
export function weekWindow(program: WeekWindowInput, localToday: string): WeekWindow {
  const { started_on } = program;
  
  // Calculate the week start directly from started_on and today
  // This avoids double-counting week_offset (cycleWeekFor already includes it)
  const daysSinceStart = daysBetween(started_on, localToday);
  const weeksElapsed = Math.floor(daysSinceStart / 7);
  
  // Start of the current cycle week, clamped to started_on (when weeksElapsed < 0)
  const cycleWeekStart = weeksElapsed >= 0 ? addDays(started_on, weeksElapsed * 7) : started_on;
  
  // Always include yesterday to catch completed/in-progress sessions for resume & missed detection
  const yesterday = addDays(localToday, -1);
  const start = yesterday < cycleWeekStart ? yesterday : cycleWeekStart;
  
  // Window extends through today+6 (for "Your week"), but never earlier than today
  const tentativeEnd = addDays(localToday, 6);
  const end = tentativeEnd < localToday ? localToday : tentativeEnd;
  
  return {
    start,
    end,
  };
}
