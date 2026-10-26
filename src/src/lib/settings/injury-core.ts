import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

/**
 * Core DB logic for setInjury.
 * Sets injury to present (with severity) or absent. Idempotent.
 */
export async function setInjuryCore(
  supabase: Client,
  userId: string,
  bodyRegion: BodyRegion,
  present: boolean,
  severity?: InjurySeverity
): Promise<{ ok: boolean; error?: string }> {
  if (present) {
    if (!severity) {
      return { ok: false, error: "Severity required when adding injury" };
    }
    
    // Add/update injury (upsert makes it idempotent)
    const { error } = await supabase
      .from("user_injuries")
      .upsert(
        { user_id: userId, body_region: bodyRegion, severity },
        { onConflict: "user_id,body_region" }
      );
    
    if (error) return { ok: false, error: error.message };
  } else {
    // Remove injury (idempotent - no error if not present)
    const { error } = await supabase
      .from("user_injuries")
      .delete()
      .eq("user_id", userId)
      .eq("body_region", bodyRegion);
    
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
