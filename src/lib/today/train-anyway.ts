import type { Database } from "@/lib/database.types";
import type { PlannableDay } from "@/app/session/actions";
import { isoWeekday } from "@/lib/dates";

type DayType = Database["public"]["Enums"]["day_type"];

export type TrainAnywayDay = {
  day_index: number;
  day_type: DayType;
  label: string | null;
};

export type ProgramDay = {
  id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
};

export type TrainAnywayInput = {
  /** Today's template day (null if not found, or for rest days) */
  todayDay: TrainAnywayDay | null;
  /** All upcoming days in the template (Mon-Sun) starting from tomorrow */
  upcomingDays: TrainAnywayDay[];
  /** Whether yesterday was a missed training day */
  missedYesterday: boolean;
};

/**
 * Determine which workout options to offer in the "Or train today anyway" prompt on a rest day.
 * 
 * Product rule (H2):
 * - If yesterday was missed, offer that missed workout first (existing behavior)
 * - Otherwise, offer the next scheduled training day in the block
 * - Always wrap to next week if needed
 * - For blocks with no strength days, return empty array (yoga/breathe handled separately)
 */
export function trainAnywayOptions(input: TrainAnywayInput): TrainAnywayDay[] {
  const { todayDay, upcomingDays, missedYesterday } = input;

  // If yesterday was missed and today has a workout in the template, offer it first
  // (existing "missed yesterday" behavior - offer the workout they should have done)
  if (missedYesterday && todayDay && isTrainingDay(todayDay.day_type)) {
    return [todayDay];
  }

  // Otherwise, find the next training day in the upcoming schedule
  const nextTrainingDay = upcomingDays.find((d) => isTrainingDay(d.day_type));
  
  if (nextTrainingDay) {
    return [nextTrainingDay];
  }

  // No training days in the block (e.g., all rest/yoga/meditation)
  return [];
}

function isTrainingDay(dayType: DayType | null): boolean {
  return dayType === "weights" || dayType === "bodyweight";
}

/**
 * Build the train-anyway options from program days and convert to PlannableDay format.
 * 
 * This bridges the pure logic (trainAnywayOptions) with the UI component (DayPlanPrompt).
 */
export function buildTrainAnywayDays({
  allDays,
  localToday,
  missedYesterday,
}: {
  allDays: ProgramDay[];
  localToday: string;
  missedYesterday: boolean;
}): PlannableDay[] {
  const todayIndex = isoWeekday(localToday);
  
  // Build today's day info
  const todayDay = allDays.find((d) => d.day_index === todayIndex) || null;
  
  // Build upcoming days array (tomorrow through end of week, then next week)
  const upcomingDays: TrainAnywayDay[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = ((todayIndex - 1 + offset) % 7) + 1;
    const day = allDays.find((d) => d.day_index === dayIndex);
    if (day) {
      upcomingDays.push({
        day_index: day.day_index,
        day_type: day.day_type,
        label: day.label,
      });
    }
  }
  
  // Get the filtered options
  const options = trainAnywayOptions({
    todayDay: todayDay ? {
      day_index: todayDay.day_index,
      day_type: todayDay.day_type,
      label: todayDay.label,
    } : null,
    upcomingDays,
    missedYesterday,
  });
  
  // Convert to PlannableDay format
  return options.map((opt) => {
    const programDay = allDays.find((d) => d.day_index === opt.day_index);
    if (!programDay) return null;
    return {
      programDayId: programDay.id,
      label: programDay.label ?? "Training",
      dayType: programDay.day_type,
    };
  }).filter((d): d is PlannableDay => d !== null);
}
