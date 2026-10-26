import type { Database } from "@/lib/database.types";
import { labelForDayType } from "@/lib/program/day-plan";

type SessionForChosen = {
  local_date: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  program_day_id: string | null;
  created_at?: string | null;
};

type DayForChosen = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  label: string | null;
};

function isStrength(actualType: string | null): boolean {
  return actualType === "weights" || actualType === "bodyweight";
}

/**
 * Status rank used by the header (and now here) to pick the "owner" of a day.
 * Completed > in_progress > planned > skipped, then newest.
 */
const OWNER_RANK: Record<string, number> = {
  completed: 1,
  in_progress: 2,
  planned: 3,
  skipped: 4,
};

/**
 * Build a map of weekday-index → chosen-day-label for "Your week" display.
 *
 * Only days that DIFFER from the template are recorded. A completed strength
 * session keeps the day's identity, so swaps remain visible after finishing.
 * Yoga and breathing are anytime activities and don't own the day.
 *
 * Uses the same ranking as the header: completed > in_progress > planned > skipped,
 * then newest, to pick which session owns the day when multiple rows exist.
 *
 * @param allSessions - All sessions in the date range
 * @param days - The program's day templates
 * @param localToday - Today's local date (YYYY-MM-DD)
 * @param todayIndex - Today's ISO weekday (1-7, Monday = 1)
 * @returns Map of day_index → label for days that differ from template
 */
export function buildChosenByDayIndex(
  allSessions: SessionForChosen[],
  days: DayForChosen[],
  localToday: string,
  todayIndex: number
): Map<number, string> {
  const chosenByDayIndex = new Map<number, string>();

  for (const d of days) {
    // The next time this weekday comes round, which is today for today.
    const daysSinceToday = (d.day_index - todayIndex + 7) % 7;
    const date = addDays(localToday, daysSinceToday);

    // Find all qualifying sessions for this date
    const candidates = allSessions.filter(
      (x) =>
        x.local_date === date &&
        (x.status === "planned" ||
          x.status === "in_progress" ||
          (x.status === "completed" && isStrength(x.actual_type))) &&
        x.actual_type !== null,
    );

    if (candidates.length === 0) continue;

    // Use header's ranking: completed > in_progress > planned > skipped, then newest
    const sess = candidates.sort(
      (a, b) =>
        (OWNER_RANK[a.status] ?? 9) - (OWNER_RANK[b.status] ?? 9) ||
        (b.created_at ?? "").localeCompare(a.created_at ?? "")
    )[0];

    if (!sess?.actual_type) continue;

    const chosenDay = sess.program_day_id
      ? days.find((pd) => pd.id === sess.program_day_id)
      : undefined;

    const label = labelForDayType(sess.actual_type, chosenDay?.label ?? null);

    // Only record differences: a choice that matches the template is not news
    if (label !== d.label) {
      chosenByDayIndex.set(d.day_index, label);
    }
  }

  return chosenByDayIndex;
}

/**
 * Simple addDays helper (internal to this module).
 */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
