/**
 * Progression-only profile units reader.
 * Returns null on error, throw, null profile, or unknown value.
 * Used to build unit-neutral feedback when units cannot be determined.
 */

import type { UnitsPreference } from "../units";

/**
 * Minimal structural type for reading profile units.
 * Allows testing with fake clients.
 */
export type ProfilesReader = {
  from(table: "profiles"): {
    select(columns: "units"): {
      eq(column: "id", value: string): {
        single(): PromiseLike<{
          data: { units: string | null } | null;
          error: unknown;
        }>;
      };
    };
  };
};

export async function readProfileUnitsOrNull(
  client: ProfilesReader,
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
