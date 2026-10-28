/**
 * Progression-only profile units reader.
 * Returns null on error, throw, null profile, or unknown value.
 * Used to build unit-neutral feedback when units cannot be determined.
 */

import type { UnitsPreference } from "../units";

/**
 * Query result type for profile units.
 */
export type ProfileUnitsQuery = PromiseLike<{
  data: { units: string | null } | null;
  error: unknown;
}>;

export async function readProfileUnitsOrNull(
  query: () => ProfileUnitsQuery
): Promise<UnitsPreference | null> {
  try {
    const { data: profile, error } = await query();
    
    if (error || !profile) return null;
    
    if (profile.units === "imperial") return "imperial";
    if (profile.units === "metric") return "metric";
    return null;
  } catch {
    return null;
  }
}
