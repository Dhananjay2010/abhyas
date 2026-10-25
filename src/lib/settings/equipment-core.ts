import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Core DB logic for setEquipmentItem.
 * Ensures item is in desired state (enabled or disabled). Idempotent.
 */
export async function setEquipmentItemCore(
  supabase: Client,
  userId: string,
  equipmentId: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (enabled) {
    // Validate equipment ID exists
    const { data: validEquipment, error: catalogueError } = await supabase
      .from("equipment")
      .select("id")
      .eq("id", equipmentId)
      .single();
    
    if (catalogueError || !validEquipment) {
      return { ok: false, error: `Invalid equipment: ${equipmentId}` };
    }
    
    // Add equipment (upsert makes it idempotent)
    const { error } = await supabase
      .from("user_equipment")
      .upsert({ user_id: userId, equipment_id: equipmentId }, { onConflict: "user_id,equipment_id" });
    
    if (error) return { ok: false, error: error.message };
  } else {
    // Remove equipment (idempotent - no error if not present)
    const { error } = await supabase
      .from("user_equipment")
      .delete()
      .eq("user_id", userId)
      .eq("equipment_id", equipmentId);
    
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Core DB logic for setHasAllEquipment.
 * Sets has_all_equipment flag to explicit state. Idempotent.
 */
export async function setHasAllEquipmentCore(
  supabase: Client,
  userId: string,
  hasAll: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({ has_all_equipment: hasAll })
    .eq("id", userId);
  
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
