/**
 * Progression-only profile units reader.
 * Returns null on error, throw, null profile, or unknown value.
 * Used to build unit-neutral feedback when units cannot be determined.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnitsPreference } from "../units";

export async function readProfileUnitsOrNull(
  client: SupabaseClient,
  userId: string
): Promise<UnitsPreference | null> {
  try {
    const { data: profile, error } = await client
      .from("profiles")
      .select("units")
      .eq("id", userId)
      .single();
    
    if (error || !profile) return null;
    
    if (profile.units === "imperial") return "imperial";
    if (profile.units === "metric") return "metric";
    return null;
  } catch {
    return null;
  }
}
