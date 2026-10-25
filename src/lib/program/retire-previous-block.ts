import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDays } from "@/lib/dates";

type Client = SupabaseClient<Database>;

/**
 * Retire the previous active block when creating a new one.
 * Sets status='completed' and ended_on=(new block's started_on - 1).
 * 
 * Used by first-build path in persist.ts.
 */
export async function retirePreviousBlock(
  client: Client,
  userId: string,
  newBlockStartedOn: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from("programs")
    .update({ status: "completed", ended_on: addDays(newBlockStartedOn, -1) })
    .eq("user_id", userId)
    .eq("status", "active");
  
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
