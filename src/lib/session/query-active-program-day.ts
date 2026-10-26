import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export type ActiveProgramDay = {
  id: string;
  day_type: DayType;
};

/**
 * Query the active program day for a user, program, and weekday.
 *
 * Filters by user_id, program_id, status='active', and day_index to avoid
 * picking days from old programs after rebuilds (program_days keeps old rows).
 */
export async function queryActiveProgramDay(
  client: SupabaseClient<Database>,
  userId: string,
  programId: string,
  dayIndex: number,
): Promise<{ day: ActiveProgramDay | null; error: string | null }> {
  const { data, error } = await client
    .from("program_days")
    .select("id, day_type")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .eq("status", "active")
    .eq("day_index", dayIndex)
    .maybeSingle();
  return { day: data, error: error?.message ?? null };
}
