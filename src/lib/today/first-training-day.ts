/**
 * Find the FIRST training day in the plan (day 1 of the plan).
 * 
 * Used for first-session offer: when a brand-new user lands on Today
 * and it's a rest day, offer them "Your first session is <day 1 label>"
 * with "Start it now" that starts day 1 of the plan, not just the next
 * calendar day.
 * 
 * Returns the first training day (weights or bodyweight) in day_index order.
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type FirstTrainingDayResult = {
  dayIndex: number;
  dayType: DayType;
  label: string | null;
  programDayId: string;
} | null;

export function findFirstTrainingDay(
  days: Array<{
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  }>
): FirstTrainingDayResult {
  // Find first training day in plan order (lowest day_index)
  const trainingDays = days
    .filter((d) => d.day_type === "weights" || d.day_type === "bodyweight")
    .sort((a, b) => a.day_index - b.day_index);

  const first = trainingDays[0];
  if (!first) return null;

  return {
    dayIndex: first.day_index,
    dayType: first.day_type,
    label: first.label,
    programDayId: first.id,
  };
}
