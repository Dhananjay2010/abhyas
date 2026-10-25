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
  /** Yesterday's template day (used when missed) */
  yesterdayDay: TrainAnywayDay | null;
  /** All upcoming days in the template (Mon-Sun) starting from tomorrow */
  upcomingDays: TrainAnywayDay[];
  /** Whether yesterday was a missed training day */
  missedYesterday: boolean;
};

/**
 * Determine which workout options to offer in the "Or train today anyway" prompt on a rest day.
 * 
 * Product rule (decided):
 * - On a rest day, offer the next upcoming strength day first ("Lift: <day name>")
 * - For blocks with no strength days, return empty array (yoga/breathe handled separately)
 * - This lets users pull forward their next planned workout to today
 */
export function trainAnywayOptions(input: TrainAnywayInput): TrainAnywayDay[] {
  const { upcomingDays } = input;

  const result: TrainAnywayDay[] = [];

  // Offer the next upcoming strength day
  const trainingDays = upcomingDays.filter((d) => isTrainingDay(d.day_type));
  
  if (trainingDays.length > 0) {
    result.push(trainingDays[0]);
  }

  return result;
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
  const yesterdayIndex = todayIndex === 1 ? 7 : todayIndex - 1;
  
  // Build today's and yesterday's day info
  const todayDay = allDays.find((d) => d.day_index === todayIndex) || null;
  const yesterdayDay = allDays.find((d) => d.day_index === yesterdayIndex) || null;
  
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
    yesterdayDay: yesterdayDay ? {
      day_index: yesterdayDay.day_index,
      day_type: yesterdayDay.day_type,
      label: yesterdayDay.label,
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
      label: `Lift: ${programDay.label ?? "Training"}`,
      dayType: programDay.day_type,
    };
  }).filter((d): d is PlannableDay => d !== null);
}
