/**
 * Which days in Today's "Your week" list show a done tick.
 *
 * A day is done when it has a completed session of any type (strength, yoga
 * or breathing) on that local date. Keyed on the session's own local_date, not
 * the plan day it came from, so a day swap marks the day it was actually done.
 */

import { weekRowDate } from "@/lib/today/chosen-by-day";

export type SessionForDone = {
  local_date: string;
  status: string;
  actual_type: string | null;
};

/** The set of local dates that have a completed session. */
export function computeDoneDays(sessions: SessionForDone[]): Set<string> {
  const done = new Set<string>();

  for (const s of sessions) {
    if (s.status === "completed" && s.actual_type) {
      done.add(s.local_date);
    }
  }

  return done;
}

/**
 * The "Your week" rows with the date each row stands for and whether it is done.
 *
 * Each row's date comes from weekRowDate, the same window and rule as
 * buildChosenByDayIndex, and a row is ticked when that date has a completed
 * session. The rolling window means yesterday's weekday row stands for next
 * week's date, so yesterday is not a row date and is never ticked.
 */
export function buildWeekDays<D extends { day_index: number }>(params: {
  days: D[];
  sessions: SessionForDone[];
  localToday: string;
  todayIndex: number;
}): Array<D & { date: string; isToday: boolean; isDone: boolean }> {
  const { days, sessions, localToday, todayIndex } = params;
  const done = computeDoneDays(sessions);

  return days.map((d) => {
    const date = weekRowDate(localToday, todayIndex, d.day_index);
    const isDone = done.has(date);
    return { ...d, date, isToday: d.day_index === todayIndex, isDone };
  });
}
