import type { Database } from "@/lib/database.types";

import { dateRange, isoWeekday } from "@/lib/dates";

export { dateRange, isoWeekday };

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


/**
 * Turn a user's whole training history into one record per calendar day.
 *
 * Streaks must span blocks: a streak that resets simply because a new
 * four-week block began would punish the user for the app's own bookkeeping.
 * Each date is attributed to the MOST RECENT program covering it, falling back
 * to the most recent program that had already started. Recency matters: a block
 * rebuilt on the same day leaves two programs covering that date, and only the
 * newer one reflects what the user is actually doing.
 */
export function buildDayRecords(input: {
  programs: { id: string; startedOn: string; endsOn: string }[];
  /** programId -> weekday (1..7) -> day type */
  dayTypesByProgram: Record<string, Record<number, DayType>>;
  completedDates: Set<string>;
  today: string;
}): DayRecord[] {
  const { programs, dayTypesByProgram, completedDates, today } = input;
  if (programs.length === 0) return [];

  const ordered = [...programs].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const first = ordered[0].startedOn;
  if (first > today) return [];

  // Search newest-first. Rebuilding a block on the same day leaves two programs
  // covering that date, and the older one is the retired schedule -- taking it
  // made a training day look like a rest day, so the streak silently skipped
  // the session the user had just finished.
  const newestFirst = [...ordered].reverse();

  return dateRange(first, today).map((date) => {
    const covering =
      newestFirst.find((p) => p.startedOn <= date && p.endsOn >= date) ??
      newestFirst.find((p) => p.startedOn <= date);

    const dayType =
      (covering && dayTypesByProgram[covering.id]?.[isoWeekday(date)]) ?? "rest";

    return { localDate: date, dayType, completed: completedDates.has(date) };
  });
}
