/**
 * Shared helper to fetch user's units preference.
 * Used by server actions to get consistent unit validation.
 * 
 * Returns "metric" as a safe fallback if the profile read fails,
 * so transient errors don't show kg weights to imperial users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnitsPreference } from "./units";

export async function getProfileUnits(
  client: SupabaseClient,
  userId: string
): Promise<UnitsPreference> {
  try {
    const { data: profile, error } = await client
      .from("profiles")
      .select("units")
      .eq("id", userId)
      .single();
    
    // If there's an error or no profile, return metric as safe fallback
    if (error || !profile) return "metric";
    
    if (profile.units === "imperial") return "imperial";
    if (profile.units === "metric") return "metric";
    return "metric";
  } catch {
    // Catch any unexpected errors and return metric as safe fallback
    return "metric";
  }
}
