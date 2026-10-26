import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { idsToDeleteOnKeep } from "@/lib/session/ids-to-delete-on-keep";

type SessionRow = {
  id: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
};

/**
 * Core logic for planDay's "keep" action.
 *
 * When the user chooses "Keep it" on a day plan prompt:
 * - If ALL planned sessions are Rest, keep them (no delete).
 *   The prompt said "Today is Rest" and "Keep it" means keep Rest.
 * - Otherwise, delete all planned sessions to revert to the template.
 *
 * Returns the IDs that were deleted (empty array means nothing was deleted).
 */
export async function keepPlannedDay(
  supabase: SupabaseClient<Database>,
  planned: SessionRow[]
): Promise<{ ok: true; deletedIds: string[] } | { ok: false; error: string }> {
  const ids = idsToDeleteOnKeep(planned);
  if (ids.length === 0) {
    return { ok: true, deletedIds: [] };
  }

  const { error } = await supabase.from("sessions").delete().in("id", ids);
  
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, deletedIds: ids };
}
