import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Backfill generation_inputs for existing blocks that were created before
 * the snapshot feature was added.
 *
 * Called by Settings server actions before applying a change that would
 * affect plan staleness (goal, level, track, days, yoga days, session length,
 * equipment, injuries). If the active block's generation_inputs is null,
 * this writes a snapshot of the profile as it is NOW (before the change),
 * so the staleness check can detect the change on reload.
 *
 * @returns true if snapshot was written, false if already existed or no active block
 */
export async function ensureGenerationSnapshot(
  supabase: Client,
  userId: string,
): Promise<boolean> {
  // Check if active block exists and has null generation_inputs
  const { data: block } = await supabase
    .from("programs")
    .select("id, generation_inputs")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!block || block.generation_inputs !== null) {
    return false; // Already has snapshot or no active block
  }

  // Fetch current profile state (before the change is applied)
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "goal, level, primary_track, days_per_week, yoga_days_per_week, preferred_session_minutes, has_all_equipment",
    )
    .eq("id", userId)
    .single();

  if (!profile) return false;

  // Fetch equipment and injuries
  const [equipmentRes, injuriesRes] = await Promise.all([
    supabase
      .from("user_equipment")
      .select("equipment_id")
      .eq("user_id", userId)
      .order("equipment_id"),
    supabase
      .from("user_injuries")
      .select("body_region")
      .eq("user_id", userId)
      .eq("severity", "current")
      .order("body_region"),
  ]);

  const equipmentIds = (equipmentRes.data ?? []).map((e) => e.equipment_id);
  const injuryRegions = (injuriesRes.data ?? []).map((i) => i.body_region);

  // Build snapshot matching the format used in persist.ts
  const snapshot = {
    goal: profile.goal,
    level: profile.level,
    track: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week,
    sessionMinutes: profile.preferred_session_minutes,
    equipmentIds,
    injuryRegions,
  };

  // Write snapshot to the active block
  const { error } = await supabase
    .from("programs")
    .update({ generation_inputs: snapshot })
    .eq("id", block.id);

  return !error;
}
