import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { placeYoga, templatesFor } from "./splits";

type Client = SupabaseClient<Database>;

/** One program_days row of the block a new block takes its weekdays from. */
export type LayoutSourceDay = {
  day_index: number;
  day_type: string;
  focus?: string | null;
  label?: string | null;
};

/** Day types that are not a scheduled session (the same set the block-1 anchor read skips). */
const RESTFUL_DAY_TYPES: ReadonlySet<string> = new Set(["rest", "active_recovery", "meditation"]);

/**
 * The weekday layout a block 2+ keeps, read from the block before it (QA2 M-1).
 *
 * #165 anchors block 1 to the sign-up weekday, but the generator only anchors
 * block 1, so every later block fell back to the default `activeDayIndices`
 * week: a Wednesday sign-up who trained Wed/Thu/Sat/Sun for four weeks was
 * moved to Mon/Tue/Thu/Fri at rollover, after a missed-days rollover and on a
 * Settings rebuild after the block ended, without being told.
 *
 * Returns the previous block's scheduled weekdays (yoga days included) in the
 * order the generator lays templates onto them (`activeIdx` order), so each
 * weekday keeps its own session (Wednesday stays Upper) and the main-lift
 * carry-over, keyed by day index, still lines up.
 *
 * The order is the rotation of the sorted weekdays whose focus/label sequence
 * best matches `placeYoga(templatesFor(...))`, the order the generator uses;
 * ties keep the lowest rotation, and a block whose labels match nothing (a
 * yoga-days change, an older generator) keeps its weekdays from the earliest
 * one. Only the weekdays are carried, never the sessions themselves.
 *
 * Returns null (the generator then uses the default mapping) when there is no
 * previous block, or when its number of scheduled days differs from the
 * profile's `days_per_week`: an explicit day change in Settings wins. A
 * pre-#165 member's previous block is on the default week, so they keep
 * Mon/Wed/Fri.
 */
export function carriedWeekdayLayout(
  previousDays: readonly LayoutSourceDay[] | null | undefined,
  daysPerWeek: number,
  yogaDaysPerWeek: number,
): number[] | null {
  if (!previousDays || previousDays.length === 0) return null;
  const scheduled = previousDays.filter(
    (d) => !RESTFUL_DAY_TYPES.has(d.day_type) && Number.isInteger(d.day_index) && d.day_index >= 1 && d.day_index <= 7,
  );
  const weekdays = [...new Set(scheduled.map((d) => d.day_index))].sort((a, b) => a - b);
  if (weekdays.length === 0 || weekdays.length !== daysPerWeek) return null;

  const trainingDays = Math.max(1, daysPerWeek - Math.min(yogaDaysPerWeek, daysPerWeek - 1));
  const yogaDays = Math.min(yogaDaysPerWeek, daysPerWeek - 1);
  const laidOut = placeYoga(templatesFor(trainingDays), yogaDays).map((e) =>
    e === "yoga" ? { focus: "yoga", label: "Yoga" } : { focus: e.focus, label: e.label },
  );
  const byWeekday = new Map(scheduled.map((d) => [d.day_index, d]));

  let best = weekdays;
  let bestScore = -1;
  for (let r = 0; r < weekdays.length; r++) {
    const rotation = [...weekdays.slice(r), ...weekdays.slice(0, r)];
    let score = 0;
    rotation.forEach((weekday, i) => {
      const day = byWeekday.get(weekday);
      const want = laidOut[i];
      if (!day || !want) return;
      if (day.label === want.label) score += 2;
      if (day.focus === want.focus) score += 1;
    });
    if (score > bestScore) {
      best = rotation;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Read the program_days a new block takes its weekdays from. A failed read
 * fails the build rather than guessing and silently moving training days.
 */
export async function loadLayoutSourceDays(
  supabase: Client,
  programId: string,
): Promise<{ ok: true; days: LayoutSourceDay[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("program_days")
    .select("day_index, day_type, focus, label")
    .eq("program_id", programId)
    .eq("status", "active");
  if (error) {
    console.error("weekday layout: program_days read failed", error);
    return { ok: false };
  }
  return { ok: true, days: data ?? [] };
}
