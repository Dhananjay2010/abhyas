/**
 * Load today's resolved program day, applying post-swap collision resolution.
 * 
 * Extracted from Today page for testability with fake clients.
 */

import type { Database } from "@/lib/database.types";

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  label: string | null;
};

export type LoadTodayPlanDeps = {
  /** Fetch active program days for the program */
  getProgramDays: (programId: string) => Promise<ProgramDay[]>;
  /** Resolve today's program day with collision resolution */
  resolveTodayDay: (programId: string, localToday: string) => Promise<{
    programDayId: string;
    dayType: string;
    label: string | null;
  } | null>;
};

export type LoadTodayPlanResult = {
  /** The scheduled program day for today */
  scheduled: ProgramDay | null;
  /** The resolved program day after collision resolution (may differ from scheduled) */
  resolved: ProgramDay | null;
};

export async function loadTodayPlan(
  deps: LoadTodayPlanDeps,
  programId: string,
  localToday: string,
  todayIndex: number
): Promise<LoadTodayPlanResult> {
  const days = await deps.getProgramDays(programId);
  const scheduled = days.find(d => d.day_index === todayIndex) ?? null;
  
  if (!scheduled) {
    return { scheduled: null, resolved: null };
  }
  
  const resolvedDay = await deps.resolveTodayDay(programId, localToday);
  
  if (!resolvedDay || resolvedDay.programDayId === scheduled.id) {
    return { scheduled, resolved: scheduled };
  }
  
  // Collision detected: return the resolved day
  const resolved = days.find(d => d.id === resolvedDay.programDayId) ?? scheduled;
  return { scheduled, resolved };
}
