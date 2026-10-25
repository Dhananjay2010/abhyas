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
 * - On a rest day, offer the next upcoming strength day first (shown as "Lift: <day name>" in UI)
 * - Then offer yesterday's missed workout if:
 *   - Yesterday was a training day with no finished session
 *   - AND the user had started before (day-1 guard applies)
 * - Then offer the next 2 distinct upcoming training days
 * - Never offer only Yoga/Breathe when training days exist
 * - For blocks with no strength days, return empty array (yoga/breathe handled separately)
 */
export function trainAnywayOptions(input: TrainAnywayInput): TrainAnywayDay[] {
  const { todayDay, yesterdayDay, upcomingDays, missedYesterday } = input;

  const result: TrainAnywayDay[] = [];
  const seenIndices = new Set<number>();
  const seenLabels = new Set<string>();

  const isRestDay = !todayDay || todayDay.day_type === "rest";
  
  // On a REST day, offer the next upcoming strength day first (for "Lift")
  const trainingDays = upcomingDays.filter((d) => isTrainingDay(d.day_type));
  if (isRestDay && trainingDays.length > 0) {
    const firstTraining = trainingDays[0];
    result.push(firstTraining);
    seenIndices.add(firstTraining.day_index);
    seenLabels.add((firstTraining.label ?? "Training").toLowerCase());
  }

  // If yesterday was missed, offer yesterday's workout
  if (missedYesterday && yesterdayDay && isTrainingDay(yesterdayDay.day_type)) {
    const normalizedLabel = (yesterdayDay.label ?? "Training").toLowerCase();
    if (!seenIndices.has(yesterdayDay.day_index) && !seenLabels.has(normalizedLabel)) {
      result.push(yesterdayDay);
      seenIndices.add(yesterdayDay.day_index);
      seenLabels.add(normalizedLabel);
    }
  }

  // Then offer the next 2 distinct upcoming training days
  const distinctTrainingDays: TrainAnywayDay[] = [];
  
  for (const day of trainingDays) {
    const normalizedLabel = (day.label ?? "Training").toLowerCase();
    if (!seenIndices.has(day.day_index) && !seenLabels.has(normalizedLabel)) {
      distinctTrainingDays.push(day);
      seenIndices.add(day.day_index);
      seenLabels.add(normalizedLabel);
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
  // On a rest day, the first option gets "Lift: " prefix for the button text
  const isRestDay = !todayDay || todayDay.day_type === "rest";
  
  return options.map((opt, index) => {
    const programDay = allDays.find((d) => d.day_index === opt.day_index);
    if (!programDay) return null;
    
    const plainLabel = programDay.label ?? "Training";
    const displayLabel = (isRestDay && index === 0) ? `Lift: ${plainLabel}` : plainLabel;
    
    return {
      programDayId: programDay.id,
      label: displayLabel,
      dayType: programDay.day_type,
    };
  }).filter((d): d is PlannableDay => d !== null);
}
