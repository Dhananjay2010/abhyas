/**
 * Resolve today's days, including retired days from old blocks.
 * 
 * After a rebuild, sessions can point to days from the old block, and we need
 * those to derive correct labels. This function collects unique program_day_ids
 * from sessions that aren't in the active block's days and loads them.
 * 
 * Exported for testing old-block day loading (X8, X9, X16).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { loadRetiredDays } from "@/lib/load-retired-days";

type Client = SupabaseClient<Database>;

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  focus: string | null;
  label: string | null;
  program_day_exercises: Array<{
    order_index: number;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
    rest_seconds: number | null;
    exercises: {
      name: string;
      cue: string | null;
      movement_pattern: Database["public"]["Enums"]["movement_pattern"];
      metric: Database["public"]["Enums"]["exercise_metric"] | null;
    } | null;
  }>;
};

type Session = {
  id: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  local_date: string;
  program_day_id: string | null;
  started_at: string | null;
  created_at: string;
};

/**
 * Resolve all days (active + retired) for a user's sessions.
 * 
 * MUTANT X8, X9, X16: Removing the retired day query or ignoring the results
 * must fail tests that depend on old block days.
 */
export async function resolveTodayDays(
  supabase: Client,
  activeDays: ProgramDay[],
  allSessions: Session[],
): Promise<ProgramDay[]> {
  const activeDayIds = new Set(activeDays.map((d) => d.id));
  const retiredDayIds = Array.from(
    new Set(
      allSessions
        .map((s) => s.program_day_id)
        .filter((id): id is string => id !== null && !activeDayIds.has(id)),
    ),
  );

  if (retiredDayIds.length === 0) {
    return activeDays;
  }

  const retiredDays = (await loadRetiredDays(supabase, retiredDayIds)) as ProgramDay[];

  return [...activeDays, ...retiredDays];
}
