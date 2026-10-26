/**
 * Resolve a deployment hostname to a gym for runtime white-label branding.
 */

import { createClient } from "@/lib/supabase/server";
import { getBrand } from "@/lib/branding";

export type GymResolution = {
  gymId: string;
  gymSlug: string;
  gymName: string;
};

/**
 * Normalize a Host header for lookup:
 * - Lowercase
 * - Strip port (:3000, :8080, etc.)
 * - Strip trailing dot
 */
function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/:\d+$/, "")       // Strip port
    .replace(/\.$/, "");        // Strip trailing dot
}

/**
 * Resolve a hostname to a gym via the gym_domains table.
 * Returns only verified mappings; unverified or unknown hosts return null.
 *
 * This uses the RPC function resolve_gym_by_host which:
 * - Normalizes the host (lowercase, strips trailing dot and :port)
 * - Returns only verified mappings
 * - Is callable by anon and authenticated users
 *
 * For unmapped hosts (localhost, *.vercel.app, unverified, or unknown),
 * the caller should fall back to the default brand via getBrand().
 */
export async function resolveGymByHost(
  host: string,
): Promise<GymResolution | null> {
  // Normalize the host header first
  const normalized = normalizeHost(host);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_gym_by_host", {
    p_host: normalized,
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

/**
 * Get the default brand for unmapped hosts.
 * Used as a fallback when resolveGymByHost returns null.
 */
export function getDefaultBrand() {
  return getBrand();
}
