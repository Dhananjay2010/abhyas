/**
 * Logic for displaying the "Your week" schedule on the Today page.
 * 
 * Shows overridden session labels ("your choice") when they differ from
 * the template, so swaps and train-anyway choices are visible.
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type WeekDayRow = {
  day_index: number;
  day_type: DayType;
  label: string | null;
};

export type WeekRowLabel = {
  /** The display label (e.g., "Push", "Rest", "Upper") */
  label: string;
  /** True if this is an override ("your choice"), false if template */
  isChoice: boolean;
};

/**
 * Determine the display label for one row in "Your week".
 * 
 * Returns the template label unless an override exists in chosenByDayIndex.
 * When an override exists, returns it with isChoice=true.
 */
export function getWeekRowLabel(
  day: WeekDayRow,
  chosenByDayIndex: Map<number, string>,
): WeekRowLabel {
  const chosen = chosenByDayIndex.get(day.day_index);
  
  if (chosen) {
    return {
      label: chosen,
      isChoice: true,
    };
  }
  
  return {
    label: day.label ?? "Rest",
    isChoice: false,
  };
}
