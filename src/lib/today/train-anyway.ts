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
  
  // If yesterday was missed, offer yesterday's workout first
  if (missedYesterday && yesterdayDay && isTrainingDay(yesterdayDay.day_type)) {
    result.push(yesterdayDay);
    seenIndices.add(yesterdayDay.day_index);
    seenLabels.add((yesterdayDay.label ?? "Training").toLowerCase());
  }

  // Add more upcoming days to reach the target count
  // Target: 2 total without missed, 3 total with missed
  const targetCount = missedYesterday ? 3 : 2;
  
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
  
  // Find the first strength day in the current cycle week (for Lift)
  let liftCandidate: TrainAnywayDay | null = null;
  if (isRestDay && program && todayCycleWeek !== null) {
    for (let offset = 1; offset <= 7; offset++) {
      const futureDate = addDays(localToday, offset);
      const futureCycleWeek = cycleWeekFor(program, futureDate);
      if (futureCycleWeek !== todayCycleWeek) break; // Stop at cycle week boundary
      
      const dayIndex = ((todayIndex - 1 + offset) % 7) + 1;
      const day = availableDays.find((d) => d.day_index === dayIndex);
      if (day && isTrainingDay(day.day_type)) {
        liftCandidate = {
          day_index: day.day_index,
          day_type: day.day_type,
          label: day.label,
        };
        break;
      }
    }
  }
  
  // Convert to PlannableDay format
  // If there's a Lift candidate, ensure it's first with the prefix
  const result: PlannableDay[] = [];
  
  // Add Lift first if we have a candidate
  if (liftCandidate) {
    const programDay = availableDays.find((d) => d.day_index === liftCandidate.day_index);
    if (programDay) {
      const label = programDay.label ?? "Training";
      result.push({
        programDayId: programDay.id,
        label,
        buttonLabel: `Lift: ${label}`,
        dayType: programDay.day_type,
      });
    }
  }
  
  // Add the rest of the options (excluding the Lift candidate if already added)
  for (const opt of options) {
    if (liftCandidate && opt.day_index === liftCandidate.day_index) {
      continue; // Skip if we already added it as Lift
    }
    
    const programDay = availableDays.find((d) => d.day_index === opt.day_index);
    if (!programDay) continue;
    
    const label = programDay.label ?? "Training";
    result.push({
      programDayId: programDay.id,
      label,
      dayType: programDay.day_type,
    });
    
    if (result.length >= 3) break; // Cap at 3 total
  }
  
  return result;
}
