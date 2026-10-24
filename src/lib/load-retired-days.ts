/**
 * Helper to load retired program days (from old blocks).
 *
 * Used when sessions point to days from a retired block.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export async function loadRetiredDays(
  client: Client,
  retiredDayIds: string[],
): Promise<{
  id: string;
  day_index: number;
  day_type: string;
  focus: string | null;
  label: string | null;
  program_day_exercises: Array<{
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
    exercises: {
      name: string;
      cue: string | null;
      movement_pattern: string | null;
      metric: string;
    };
  }>;
}[]> {
  if (retiredDayIds.length === 0) {
    return [];
  }

  const { data } = await client
    .from("program_days")
    .select(
      "id, day_index, day_type, focus, label, program_day_exercises(order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern, metric))",
    )
    .in("id", retiredDayIds)
    .order("order_index", { referencedTable: "program_day_exercises" });

  return (data || []) as ReturnType<typeof loadRetiredDays> extends Promise<infer T> ? T : never;
}
