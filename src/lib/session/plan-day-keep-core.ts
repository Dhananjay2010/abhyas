import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SessionRow = {
  id: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
};

/**
 * Core logic for planDay's "keep" action.
 *
 * When the user chooses "Keep it" on a day plan prompt:
 * - Keep whatever planned choice exists (training, yoga, breathing, or rest).
 * - "Keep it" is a no-op for any override - the user explicitly wants to keep
 *   what they chose.
 *
 * Returns an empty deletedIds array (nothing was deleted).
 */
export async function keepPlannedDay(
  _supabase: SupabaseClient<Database>,
  _planned: SessionRow[]
): Promise<{ ok: true; deletedIds: string[] } | { ok: false; error: string }> {
  // "Keep it" always keeps: training override, yoga override, breathing override, or Rest override
  return { ok: true, deletedIds: [] };
}
