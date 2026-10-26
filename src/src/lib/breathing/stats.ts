import { addDays, isoWeekday } from "@/lib/dates";

export type PracticeDay = { localDate: string; seconds: number };

export type BreathingStats = {
  /** Monday of the current week, yyyy-mm-dd. */
  weekStart: string;
  /** Monday to Sunday: whether there was any practice that day. */
  weekDays: boolean[];
  weekSeconds: number;
  /** Days in a row with a practice, ending today -- or yesterday, if today is still to come. */
  streak: number;
};

/**
 * The breathing tab's own numbers, separate from the training streak.
 *
 * A breathing streak is counted in calendar days, not scheduled training days:
 * breathing is not in the plan, so there is no rest day to skip over. As with
 * the training streak, an empty today does not break it, because the day is
 * not over yet.
 */
export function breathingStats(practices: PracticeDay[], today: string): BreathingStats {
  const weekStart = addDays(today, 1 - isoWeekday(today));
  const weekEnd = addDays(weekStart, 6);
  const days = new Set(practices.map((p) => p.localDate));

  const weekDays = Array.from({ length: 7 }, (_, i) => days.has(addDays(weekStart, i)));
  const weekSeconds = practices
    .filter((p) => p.localDate >= weekStart && p.localDate <= weekEnd)
    .reduce((n, p) => n + Math.max(0, p.seconds), 0);

  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor) && streak < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return { weekStart, weekDays, weekSeconds, streak };
}

// ---------------------------------------------------------------------------
// Does it actually work for you?
// ---------------------------------------------------------------------------

export type MoodLog = {
  patternName: string;
  moodBefore: number | null;
  moodAfter: number | null;
};

export type CalmShift = {
  patternName: string;
  practices: number;
  /** Average of how you felt afterwards, 1 (tense) to 5 (calm). */
  averageAfter: number;
  /** Average change, when you checked in before as well. Null when you never did. */
  averageShift: number | null;
};

/**
 * How each practice leaves you, from your own check-ins.
 *
 * Only practices you rated count, and only those you have rated at least
 * `minimum` times: one good evening is not evidence, and saying so with a
 * single data point would be worse than saying nothing.
 */
export function calmShifts(logs: MoodLog[], minimum = 2): CalmShift[] {
  const byPattern = new Map<string, MoodLog[]>();
  for (const log of logs) {
    if (log.moodAfter === null) continue;
    const list = byPattern.get(log.patternName);
    if (list) list.push(log);
    else byPattern.set(log.patternName, [log]);
  }

  const out: CalmShift[] = [];
  for (const [patternName, rated] of byPattern) {
    if (rated.length < minimum) continue;
    const withBoth = rated.filter((l) => l.moodBefore !== null);
    const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
    out.push({
      patternName,
      practices: rated.length,
      averageAfter: mean(rated.map((l) => l.moodAfter as number)),
      averageShift: withBoth.length
        ? mean(withBoth.map((l) => (l.moodAfter as number) - (l.moodBefore as number)))
        : null,
    });
  }

  return out.sort((a, b) => b.practices - a.practices || b.averageAfter - a.averageAfter);
}
