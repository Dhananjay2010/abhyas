import type { Database } from "@/lib/database.types";

export { dateRange, isoWeekday } from "@/lib/dates";

type DayType = Database["public"]["Enums"]["day_type"];

export type DayRecord = {
  /** ISO date in the user's own timezone, e.g. "2026-09-08". */
  localDate: string;
  dayType: DayType;
  completed: boolean;
};

export type Streaks = {
  current: number;
  longest: number;
  totalSessions: number;
};

const RESTFUL: ReadonlySet<DayType> = new Set<DayType>(["rest", "active_recovery"]);

/**
 * Streaks counted in scheduled training days, not calendar days.
 *
 * A rest day is part of the plan, so it neither extends nor breaks a streak —
 * it is skipped over. Only a scheduled active day that was not completed
 * breaks it. Today is also skipped when incomplete, because the day is not
 * over yet and a half-finished Tuesday should not read as a failure.
 *
 * `days` must be ordered oldest first.
 */
export function computeStreaks(days: DayRecord[], today: string): Streaks {
  const totalSessions = days.filter((d) => d.completed).length;

  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.localDate > today) continue;
    if (RESTFUL.has(d.dayType)) continue;
    if (d.localDate === today && !d.completed) continue;
    if (d.completed) current++;
    else break;
  }

  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.localDate > today) break;
    if (RESTFUL.has(d.dayType)) continue;
    if (d.localDate === today && !d.completed) continue;
    if (d.completed) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  return { current, longest: Math.max(longest, current), totalSessions };
}
