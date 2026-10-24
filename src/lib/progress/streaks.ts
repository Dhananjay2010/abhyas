import type { Database } from "@/lib/database.types";

import { dateRange, isoWeekday } from "@/lib/dates";
import { countsTowardStreak } from "./training-days";
import { blockForDate, type BlockRange } from "@/lib/program/block-range";

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
  // Note: buildDayRecords already filtered to qualifying sessions only
  const totalSessions = days.filter((d) => d.completed).length;

  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    
    // TZ-1: COMPLETED sessions always count, even if dated beyond today in new timezone
    if (d.completed && d.actualSessionType) {
      current++;
      continue;
    }
    
    // Not completed: skip future planned days, rest days, and today
    if (d.localDate > today) continue; // Future planned day
    if (d.localDate === today) continue; // Today incomplete is not a failure
    if (RESTFUL.has(d.dayType)) continue; // Template rest day, no session
    // Missed a scheduled training day
    break;
  }

  let longest = 0;
  let run = 0;
  for (const d of days) {
    // TZ-1: COMPLETED sessions always count, even if dated beyond today in new timezone
    if (d.completed && d.actualSessionType) {
      run++;
      if (run > longest) longest = run;
      continue;
    }
    
    // Not completed: skip future planned days, rest days, and today
    if (d.localDate > today) break; // Stop at future planned days
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
 *
 * Each date is attributed to the block covering it by RANGE (started_on..ended_on),
 * never by "newest". This fixes the mid-block rebuild bug: past days stay with
 * the block that was active when they happened, so a rebuild doesn't rewrite history.
 *
 * Now also tracks the ACTUAL session type completed on each date, so "train anyway"
 * sessions on template rest days count toward streaks.
 */
export function buildDayRecords(input: {
  programs: Array<{ id: string; startedOn: string; endsOn: string; endedOn?: string | null }>;
  /** programId -> weekday (1..7) -> day type */
  dayTypesByProgram: Record<string, Record<number, DayType>>;
  /** Completed sessions with their actual types, status, and working set counts */
  completedSessions: Array<{ 
    local_date: string; 
    actual_type: SessionType | null;
    status: string;
    working_set_count?: number;
  }>;
  today: string;
}): DayRecord[] {
  const { programs, dayTypesByProgram, completedSessions, today } = input;
  if (programs.length === 0) return [];

  const ordered = [...programs].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const first = ordered[0].startedOn;
  if (first > today) return [];

  // Convert to BlockRange format for blockForDate
  // L2: ended_on semantics: null = still active (covers today and beyond).
  // Do NOT fall back to endsOn for active blocks; that incorrectly stops coverage at the planned end.
  const blocks: BlockRange[] = programs.map((p) => ({
    id: p.id,
    started_on: p.startedOn,
    ended_on: p.endedOn ?? null,
  }));

  // Map dates to their actual session types.
  // Only include sessions that count toward streaks (countsTowardStreak enforces the rules).
  // If multiple qualifying sessions on the same date, prefer the first one.
  const sessionsByDate = new Map<string, SessionType | null>();
  for (const s of completedSessions) {
    // Only add sessions that pass the streak counting rules
    if (!countsTowardStreak(s.actual_type, s.status, s.working_set_count)) {
      continue;
    }
    
    const existing = sessionsByDate.get(s.local_date);
    // Keep the first qualifying session on each date
    if (!existing) {
      sessionsByDate.set(s.local_date, s.actual_type);
    }
  }

  // TZ-1: Include days beyond today if there are completed sessions on those dates
  // (happens after timezone change: yesterday's session becomes "tomorrow" in new zone)
  const latestSessionDate = Array.from(sessionsByDate.keys()).reduce(
    (latest, date) => (date > latest ? date : latest),
    today
  );
  const lastDate = latestSessionDate > today ? latestSessionDate : today;

  // M3: For days after the LAST block's ended_on (when no next block exists yet),
  // inherit the training schedule from the previous block so that missed training days
  // break the streak. This ensures the streak is the same before and after rollover.
  // However, gaps BETWEEN blocks (when a next block already exists) are treated as rest days.
  let lastBlockId: string | null = null;
  
  // Check if there's a block starting after a given date
  const hasBlockAfter = (date: string) => blocks.some(b => b.started_on > date);
  
  return dateRange(first, lastDate).map((date) => {
    const covering = blockForDate(blocks, date);

    let dayType: DayType;
    if (covering) {
      // Date is covered by a block: use its schedule
      dayType = dayTypesByProgram[covering.id]?.[isoWeekday(date)] ?? "rest";
      lastBlockId = covering.id;
    } else if (lastBlockId && !hasBlockAfter(date)) {
      // M3: Day after last block's ended_on with NO next block yet - use previous block's schedule
      // This way, if Mon was a training day and the user misses time before rollover, streak breaks
      dayType = dayTypesByProgram[lastBlockId]?.[isoWeekday(date)] ?? "rest";
    } else {
      // Before first block OR gap between blocks (next block exists) - rest day
      dayType = "rest";
    }

    const actualSessionType = sessionsByDate.get(date) ?? null;
    const completed = actualSessionType !== null;

    return { localDate: date, dayType, completed, actualSessionType };
  });
}
