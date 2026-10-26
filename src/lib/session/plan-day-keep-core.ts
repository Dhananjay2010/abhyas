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
  if (planned.length === 0) {
    return { ok: true, deletedIds: [] };
  }

  // On a Rest override day, "Keep it" must keep the Rest override, not delete it.
  // If all planned sessions are Rest, don't delete.
  const allRest = planned.every((s) => s.actual_type === "rest");
  if (allRest) {
    return { ok: true, deletedIds: [] };
  }

  // Delete all non-Rest overrides to revert to the template
  const ids = planned.map((s) => s.id);
  const { error } = await supabase.from("sessions").delete().in("id", ids);
  
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, deletedIds: ids };
}
