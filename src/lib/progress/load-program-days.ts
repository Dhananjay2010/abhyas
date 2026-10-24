import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Load program days for the progress page.
 * Filters to status='active' and orders by day_index.
 * Used to build dayTypesByProgram for streak calculation.
 */
export async function loadProgramDays(client: Client) {
  return await client
    .from("program_days")
    .select("program_id, day_index, day_type")
    .order("day_index");
}
