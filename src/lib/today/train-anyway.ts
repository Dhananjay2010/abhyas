import type { Database } from "@/lib/database.types";
import type { PlannableDay } from "@/app/session/actions";
import { isoWeekday, addDays } from "@/lib/dates";
import { cycleWeekFor } from "@/lib/program/block-range";

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
 * Determine which workout options to offer in the "Or train today anyway" prompt.
 * 
 * Product rule:
 * - On a REST day with upcoming strength: offer "Lift" (first upcoming strength) first
 * - Then offer yesterday's missed workout if any (unless it's the Lift day)
 * - Then offer additional distinct upcoming training days
 * - Total: 2 options without missed, 3 with missed (matching 17ab2392 with Lift moved first)
 * - For blocks with no strength days, return empty array (yoga/breathe handled separately)
 */
export function trainAnywayOptions(input: TrainAnywayInput): TrainAnywayDay[] {
  const { todayDay, yesterdayDay, upcomingDays, missedYesterday } = input;

  const result: TrainAnywayDay[] = [];
  const seenIndices = new Set<number>();
  const seenLabels = new Set<string>();

  const isRestDay = !todayDay || todayDay.day_type === "rest";
  const trainingDays = upcomingDays.filter((d) => isTrainingDay(d.day_type));
  
  // On a REST day, offer the next upcoming strength day first (for "Lift")
  let hasLift = false;
  if (isRestDay && trainingDays.length > 0) {
    const firstTraining = trainingDays[0];
    result.push(firstTraining);
    seenIndices.add(firstTraining.day_index);
    seenLabels.add((firstTraining.label ?? "Training").toLowerCase());
    hasLift = true;
  }

  // If yesterday was missed, offer yesterday's workout (unless it's the Lift day)
  if (missedYesterday && yesterdayDay && isTrainingDay(yesterdayDay.day_type)) {
    const normalizedLabel = (yesterdayDay.label ?? "Training").toLowerCase();
    if (!seenIndices.has(yesterdayDay.day_index) && !seenLabels.has(normalizedLabel)) {
      result.push(yesterdayDay);
      seenIndices.add(yesterdayDay.day_index);
      seenLabels.add(normalizedLabel);
    }
  }

  // Add more upcoming days to reach the target count
  // Target: 2 total on rest day without missed (Lift + 1 more)
  //         3 total on rest day with missed (Lift + missed + 1 more)
  //         2 total on training day without missed
  //         3 total on training day with missed
  const targetCount = hasLift ? (missedYesterday ? 3 : 2) : (missedYesterday ? 3 : 2);
  
  for (const day of trainingDays) {
    if (result.length >= targetCount) break;
    
    const normalizedLabel = (day.label ?? "Training").toLowerCase();
    if (!seenIndices.has(day.day_index) && !seenLabels.has(normalizedLabel)) {
      result.push(day);
      seenIndices.add(day.day_index);
      seenLabels.add(normalizedLabel);
    }
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
  pulledForwardDayIds,
  program,
}: {
  allDays: ProgramDay[];
  localToday: string;
  missedYesterday: boolean;
  pulledForwardDayIds?: Map<string, { programDayId: string }>;
  program?: {
    started_on: string;
    week_offset: number;
  };
}): PlannableDay[] {
  const todayIndex = isoWeekday(localToday);
  const yesterdayIndex = todayIndex === 1 ? 7 : todayIndex - 1;
  
  // Filter out pulled-forward days (they should not be offered again)
  const availableDays = allDays.filter(
    (d) => !pulledForwardDayIds || !pulledForwardDayIds.has(d.id)
  );
  
  // Build today's and yesterday's day info
  const todayDay = availableDays.find((d) => d.day_index === todayIndex) || null;
  const yesterdayDay = availableDays.find((d) => d.day_index === yesterdayIndex) || null;
  
  const isRestDay = !todayDay || todayDay.day_type === "rest";
  const todayCycleWeek = program ? cycleWeekFor(program, localToday) : null;
  
  // Build upcoming days array (tomorrow through end of week, then next week)
  // For Lift on rest days, only include strength days from the same cycle week
  const upcomingDays: TrainAnywayDay[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = ((todayIndex - 1 + offset) % 7) + 1;
    const day = availableDays.find((d) => d.day_index === dayIndex);
    if (!day) continue;
    
    // For rest day Lift option, only include days in the same cycle week
    if (isRestDay && program && todayCycleWeek !== null && isTrainingDay(day.day_type)) {
      const futureDate = addDays(localToday, offset);
      const futureCycleWeek = cycleWeekFor(program, futureDate);
      if (futureCycleWeek !== todayCycleWeek) {
        continue; // Skip strength days in future cycle weeks
      }
    }
    
    upcomingDays.push({
      day_index: day.day_index,
      day_type: day.day_type,
      label: day.label,
    });
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
  // On a rest day, the first option gets "Lift: " prefix for the button text only
  const result: PlannableDay[] = [];
  for (let index = 0; index < options.length; index++) {
    const opt = options[index];
    const programDay = availableDays.find((d) => d.day_index === opt.day_index);
    if (!programDay) continue;
    
    const label = programDay.label ?? "Training";
    const buttonLabel = (isRestDay && index === 0) ? `Lift: ${label}` : undefined;
    
    result.push({
      programDayId: programDay.id,
      label,
      ...(buttonLabel ? { buttonLabel } : {}),
      dayType: programDay.day_type,
    });
  }
  return result;
}
