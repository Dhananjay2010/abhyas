/**
 * Shared helper to fetch user's units preference.
 * Used by server actions to get consistent unit validation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnitsPreference } from "./units";

export async function getProfileUnits(
  client: SupabaseClient,
  userId: string
): Promise<UnitsPreference> {
  const { data: profile } = await client
    .from("profiles")
    .select("units")
    .eq("id", userId)
    .single();
  
  if (profile?.units === "imperial") return "imperial";
  if (profile?.units === "metric") return "metric";
  return "metric";
}
