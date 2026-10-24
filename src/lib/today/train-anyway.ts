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
 * Product rule (decided):
 * - On a rest day, offer yesterday's missed workout first if:
 *   - Yesterday was a training day with no finished session
 *   - AND the user had started before (day-1 guard applies)
 * - Then offer the next 2 distinct upcoming training days
 * - Never offer only Yoga/Breathe when training days exist
 * - For blocks with no strength days, return empty array (yoga/breathe handled separately)
 */
export function trainAnywayOptions(input: TrainAnywayInput): TrainAnywayDay[] {
  const { todayDay, upcomingDays, missedYesterday } = input;

  const result: TrainAnywayDay[] = [];

  // If yesterday was missed, offer yesterday's workout first
  // (only if today's template has a training day - that represents yesterday's missed workout)
  if (missedYesterday && todayDay && isTrainingDay(todayDay.day_type)) {
    result.push(todayDay);
  }

  // Then offer the next 2 distinct upcoming training days
  const trainingDays = upcomingDays.filter((d) => isTrainingDay(d.day_type));
  
  // Get the next 2 distinct training days (by day_index to avoid duplicates)
  const distinctTrainingDays: TrainAnywayDay[] = [];
  const seenIndices = new Set<number>();
  
  for (const day of trainingDays) {
    if (!seenIndices.has(day.day_index)) {
      distinctTrainingDays.push(day);
      seenIndices.add(day.day_index);
    }
    if (distinctTrainingDays.length >= 2) break;
  }
  
  result.push(...distinctTrainingDays.slice(0, 2));

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
