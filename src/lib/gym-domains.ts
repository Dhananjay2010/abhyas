/**
 * Resolve a deployment hostname to a gym for runtime white-label branding.
 */

import { createClient } from "@/lib/supabase/server";

export type GymResolution = {
  gymId: string;
  gymSlug: string;
  gymName: string;
};

/**
 * Resolve a hostname to a gym via the gym_domains table.
 * Returns only verified mappings; unverified or unknown hosts return null.
 *
 * This uses the RPC function resolve_gym_by_host which:
 * - Normalizes the host (lowercase, strips trailing dot and :port)
 * - Returns only verified mappings
 * - Is callable by anon and authenticated users
 */
export async function resolveGymByHost(
  host: string,
): Promise<GymResolution | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_gym_by_host", {
    p_host: host,
  });

  if (error) {
    console.error("Failed to resolve gym by host:", error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    gymId: row.gym_id,
    gymSlug: row.gym_slug,
    gymName: row.gym_name,
  };
}
