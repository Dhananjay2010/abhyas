/**
 * Which days in Today's "Your week" list show a done tick.
 *
 * A day is done when it has a completed session of any type (strength, yoga
 * or breathing) on that local date. Keyed on the session's own local_date, not
 * the plan day it came from, so a day swap marks the day it was actually done.
 */

import { addDays } from "@/lib/dates";

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
 * The list is rolling: each weekday is the next time it comes round, which is
 * today for today (the same rule buildChosenByDayIndex uses).
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
    const date = addDays(localToday, (d.day_index - todayIndex + 7) % 7);
    const isDone = done.has(date);
    return { ...d, date, isToday: d.day_index === todayIndex, isDone };
  });
}
