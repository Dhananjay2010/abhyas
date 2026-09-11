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
