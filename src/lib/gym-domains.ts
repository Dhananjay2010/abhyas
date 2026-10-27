/**
 * Resolve a deployment hostname to a gym for runtime white-label branding.
 */

import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/branding";
import { neutralBrand } from "@/lib/gym-brand";

export type GymResolution = {
  gymId: string;
  gymSlug: string;
  gymName: string;
};

/**
 * Special marker returned when RPC errors on a custom domain (not app's own domain).
 * Signals the caller to use the neutral brand instead of the default brand.
 */
export const USE_NEUTRAL_BRAND = Symbol("USE_NEUTRAL_BRAND");

/**
 * Check if a host is the app's own domain (not a custom gym domain).
 * Returns true for:
 * - localhost or 127.0.0.1 (with or without port)
 * - *.vercel.app
 * - The host from NEXT_PUBLIC_SITE_URL (if set)
 */
export function isAppOwnDomain(host: string): boolean {
  const normalized = host.toLowerCase();
  
  // localhost or 127.0.0.1
  if (normalized === "localhost" || normalized === "127.0.0.1" || 
      normalized === "::1" || normalized.startsWith("localhost:") || 
      normalized.startsWith("127.0.0.1:") || normalized.startsWith("[::1]")) {
    return true;
  }
  
  // *.vercel.app
  if (normalized === "vercel.app" || normalized.endsWith(".vercel.app")) {
    return true;
  }
  
  // NEXT_PUBLIC_SITE_URL host
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL);
      if (normalized === siteUrl.hostname.toLowerCase()) {
        return true;
      }
    } catch {
      // Invalid NEXT_PUBLIC_SITE_URL, ignore
    }
  }
  
  return false;
}

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
 * Pure decision logic for gym resolution.
 * Takes the normalized host, app domain check, lookup result, and error flag.
 * Returns the gym resolution decision without side effects.
 * 
 * Three cases:
 * 1. Host is app's own domain -> null (default brand)
 * 2. Lookup succeeded with no results (unmapped) -> null (default brand)
 * 3. Lookup errored on custom domain -> USE_NEUTRAL_BRAND (neutral brand)
 * 4. Lookup succeeded with results -> GymResolution
 */
export function decideGymResolution(
  normalizedHost: string,
  isAppDomain: boolean,
  lookupResult: GymResolution[] | null,
  lookupError: boolean,
): GymResolution | null | typeof USE_NEUTRAL_BRAND {
  // Case 1: Host is the app's own domain
  if (isAppDomain) {
    return null;
  }

  // Case 3: RPC error on a custom domain (not app's own domain)
  if (lookupError) {
    return USE_NEUTRAL_BRAND;
  }

  // Case 2: Lookup succeeded but no verified row (genuinely unmapped host)
  if (!lookupResult || lookupResult.length === 0) {
    return null;
  }

  // Case 4: Lookup succeeded with a verified mapping
  return lookupResult[0];
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
 * Three cases:
 * 1. Host is the app's own domain (localhost, *.vercel.app, NEXT_PUBLIC_SITE_URL):
 *    Returns null → caller uses default brand.
 * 2. Lookup succeeded but no verified row (genuinely unmapped host):
 *    Returns null → caller uses default brand.
 * 3. Lookup errored on a custom domain (not app's own domain):
 *    Returns USE_NEUTRAL_BRAND symbol → caller uses neutralBrand.
 *    This prevents gym members from seeing another brand on their gym's domain during an outage.
 */
export async function resolveGymByHost(
  host: string | null | undefined,
): Promise<GymResolution | null | typeof USE_NEUTRAL_BRAND> {
  // Guard null, undefined, or empty host
  if (!host || host.trim() === '') {
    return null;
  }

  // Normalize the host header first
  const normalized = normalizeHost(host);

  // Check if it's an app domain
  const isAppDomain = isAppOwnDomain(normalized);

  // For app domains, short-circuit without RPC call
  if (isAppDomain) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_gym_by_host", {
    p_host: normalized,
  });

  if (error) {
    console.error("Failed to resolve gym by host:", error);
  }

  // Map RPC data (snake_case) to GymResolution (camelCase)
  const mappedData: GymResolution[] | null = data
    ? data.map(row => ({
        gymId: row.gym_id,
        gymSlug: row.gym_slug,
        gymName: row.gym_name,
      }))
    : null;

  // Use pure decision logic
  return decideGymResolution(normalized, isAppDomain, mappedData, Boolean(error));
}

/**
 * Get the default brand for unmapped hosts (case 1 and 2).
 * Used as a fallback when resolveGymByHost returns null.
 */
export function getDefaultBrand() {
  return branding;
}

/**
 * Get the neutral brand for outage scenarios (case 3).
 * Used when resolveGymByHost returns USE_NEUTRAL_BRAND.
 * Never cached - only for transient outage scenarios.
 */
export function getNeutralBrand() {
  return neutralBrand;
}
