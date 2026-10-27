/**
 * Resolve a deployment hostname to a gym for runtime white-label branding.
 */

import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/branding";

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
 * - Strip IPv6 brackets and port ([::1]:3000 -> ::1)
 */
export function normalizeHost(host: string): string {
  let normalized = host.trim();
  
  // Strip IPv6 brackets and port: [::1]:3000 -> ::1
  if (normalized.startsWith('[')) {
    const closeBracket = normalized.indexOf(']');
    if (closeBracket !== -1) {
      normalized = normalized.slice(1, closeBracket);
    }
  } else {
    // Strip port for regular hostnames
    normalized = normalized.replace(/:\d+$/, '');
  }
  
  // Lowercase and strip trailing dot
  return normalized.toLowerCase().replace(/\.$/, '');
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
 * the caller should fall back to the default brand via getDefaultBrand().
 */
export async function resolveGymByHost(
  host: string | null | undefined,
): Promise<GymResolution | null> {
  // Guard null, undefined, or empty host
  if (!host || host.trim() === '') {
    return null;
  }

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
  return branding;
}
