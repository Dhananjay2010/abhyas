import type { Database } from "@/lib/database.types";

import { dateRange, isoWeekday } from "@/lib/dates";
import { countsTowardStreak } from "./training-days";

export { dateRange, isoWeekday };

type DayType = Database["public"]["Enums"]["day_type"];
type SessionType = Database["public"]["Enums"]["day_type"];

export type DayRecord = {
  /** ISO date in the user's own timezone, e.g. "2026-09-08". */
  localDate: string;
  /** The template schedule for this day. */
  dayType: DayType;
  /** True if a session was completed on this date. */
  completed: boolean;
  /**
   * The actual session type completed on this date (when completed is true).
   * Null when no session was completed.
   */
  actualSessionType: SessionType | null;
};

export type Streaks = {
  current: number;
  longest: number;
  totalSessions: number;
};

const RESTFUL: ReadonlySet<DayType> = new Set<DayType>(["rest", "active_recovery", "meditation"]);

/**
 * Streaks are counted based on ACTUAL completed sessions, not the template schedule.
 *
 * Product rule (2026-10-24): ANY completed strength or yoga session counts toward
 * the streak and "days trained", regardless of what the template says about that day.
 * A "train anyway" session on a template rest day counts. Breathing practices never count.
 *
 * CRITICAL: Streak and "days trained" MUST count the same set of sessions.
 * Both use countsTowardStreak() to ensure they agree.
 *
 * A template rest day with no session neither extends nor breaks the streak — it is
 * skipped. Only a scheduled training day that was not completed breaks the streak.
 * Today is also skipped when incomplete, because the day is not over yet.
 *
 * `days` must be ordered oldest first.
 */
export function computeStreaks(days: DayRecord[], today: string): Streaks {
  // Days trained: count actual completed sessions that qualify
  const totalSessions = days.filter(
    (d) => d.completed && countsTowardStreak(d.actualSessionType)
  ).length;

  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.localDate > today) continue;
    
    // If completed, check actual session type (handles "train anyway")
    if (d.completed && d.actualSessionType) {
      if (countsTowardStreak(d.actualSessionType)) {
        current++;
      }
      // Breathe-only days don't count but don't break the streak either
      continue;
    }
    
    // Not completed: rest days don't break streak, training days do
    if (d.localDate === today) continue; // Today incomplete is not a failure
    if (RESTFUL.has(d.dayType)) continue; // Template rest day, no session
    // Missed a scheduled training day
    break;
  }

  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.localDate > today) break;
    
    // If completed, check actual session type
    if (d.completed && d.actualSessionType) {
      if (countsTowardStreak(d.actualSessionType)) {
        run++;
        if (run > longest) longest = run;
      }
      // Breathe-only days don't count but don't break the streak
      continue;
    }
    
    // Not completed: rest days don't break streak, training days do
    if (d.localDate === today) continue;
    if (RESTFUL.has(d.dayType)) continue;
    // Missed a scheduled training day
    run = 0;
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
 *
 * Now also tracks the ACTUAL session type completed on each date, so "train anyway"
 * sessions on template rest days count toward streaks.
 */
export function buildDayRecords(input: {
  programs: { id: string; startedOn: string; endsOn: string }[];
  /** programId -> weekday (1..7) -> day type */
  dayTypesByProgram: Record<string, Record<number, DayType>>;
  /** Completed sessions with their actual types */
  completedSessions: Array<{ local_date: string; actual_type: SessionType | null }>;
  today: string;
}): DayRecord[] {
  const { programs, dayTypesByProgram, completedSessions, today } = input;
  if (programs.length === 0) return [];

  const ordered = [...programs].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const first = ordered[0].startedOn;
  if (first > today) return [];

  // Search newest-first. Rebuilding a block on the same day leaves two programs
  // covering that date, and the older one is the retired schedule -- taking it
  // made a training day look like a rest day, so the streak silently skipped
  // the session the user had just finished.
  const newestFirst = [...ordered].reverse();

  // Map dates to their actual session types
  const sessionsByDate = new Map<string, SessionType | null>();
  for (const s of completedSessions) {
    sessionsByDate.set(s.local_date, s.actual_type);
  }

  return dateRange(first, today).map((date) => {
    const covering =
      newestFirst.find((p) => p.startedOn <= date && p.endsOn >= date) ??
      newestFirst.find((p) => p.startedOn <= date);

    const dayType =
      (covering && dayTypesByProgram[covering.id]?.[isoWeekday(date)]) ?? "rest";

    const actualSessionType = sessionsByDate.get(date) ?? null;
    const completed = actualSessionType !== null;

    return { localDate: date, dayType, completed, actualSessionType };
  });
}
