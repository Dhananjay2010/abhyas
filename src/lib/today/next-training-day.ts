/**
 * Find the next training day (weights or bodyweight) from a given date.
 * Used for first-day rest day: "Your first session is <Weekday>".
 */

import { addDays, isoWeekday, DAY_NAMES } from "@/lib/dates";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export interface ProgramDay {
  day_index: number;
  day_type: DayType;
}

export function nextTrainingDay(
  days: ProgramDay[],
  localToday: string
): { dayName: string; dayIndex: number } | null {
  // Scan forward from tomorrow to find the next training day
  // (offset 1 not 0: when today is overridden to rest, we want the next day, not today)
  for (let offset = 1; offset < 8; offset++) {
    const checkDate = addDays(localToday, offset);
    const checkIndex = isoWeekday(checkDate);
    const checkDay = days.find((d) => d.day_index === checkIndex);

    if (checkDay && ownsPlannedWorkout(checkDay.day_type)) {
      return {
        dayName: DAY_NAMES[checkIndex - 1],
        dayIndex: checkIndex,
      };
    }
  }

  return null;
}
