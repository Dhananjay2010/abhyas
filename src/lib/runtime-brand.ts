/**
 * Runtime gym branding resolution for per-request white-label hosting.
 *
 * Resolves brand via 3-tier fallback:
 * 1. Host-mapped verified gym (host wins)
 * 2. User's active gym membership (member fallback)
 * 3. Base brand (default)
 */

import { headers } from "next/headers";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { branding, type Brand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getGymBrand, neutralBrand } from "@/lib/gym-brand";
import { getUserGymMembership } from "@/lib/gym/member-gym";
import { accessibleTextColor } from "@/lib/contrast";
import { ensureMinContrast } from "@/lib/brand-contrast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * RPC return type for resolve_gym_by_host (migration 037).
 * Returns only gym_id, gym_slug, gym_name.
 * The SQL already filters d.verified = true, so verified is not in the result.
 */
type ResolveGymByHostResult = {
  gym_id: string;
  gym_slug: string;
  gym_name: string;
};

/**
 * Type guard for resolve_gym_by_host RPC result
 */
function isResolveGymByHostResult(row: unknown): row is ResolveGymByHostResult {
  if (typeof row !== 'object' || row === null) return false;
  if (!('gym_id' in row) || typeof row.gym_id !== 'string') return false;
  if (!('gym_slug' in row) || typeof row.gym_slug !== 'string') return false;
  if (!('gym_name' in row) || typeof row.gym_name !== 'string') return false;
  return true;
}

/**
 * Resolution result for branding.
 * Tracks which tier resolved the brand (for host-wins notice).
 */
export type BrandResolution = {
  brand: Brand;
  /** Gym ID that provided the brand (null if base) */
  gymId: string | null;
  /** Gym name (null if base) */
  gymName: string | null;
  /** Resolution tier: 'host', 'member', or 'base' */
  tier: "host" | "member" | "base";
};

/**
 * Resolve gym ID from host domain (optionally cached).
 * 
 * @param supabase Supabase client
 * @param normalizedHost Normalized host (lowercase, port stripped)
 * @param useCache Whether to use unstable_cache (requires Next.js runtime)
 * @returns Gym resolution result or null
 */
async function resolveHostToBranding(
  supabase: SupabaseClient<Database>,
  normalizedHost: string,
  useCache: boolean = true
): Promise<{ gymId: string; gymName: string | null } | null> {
  const resolveFn = async () => {
    try {
      const { data, error } = await supabase.rpc("resolve_gym_by_host", {
        p_host: normalizedHost,
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        
        if (!isResolveGymByHostResult(row)) {
          return null;
        }
        
        if (row.gym_id) {
          return {
            gymId: row.gym_id,
            gymName: row.gym_name || null,
          };
        }
      }
      
      return null;
    } catch {
      return null;
    }
  };
  
  if (!useCache) {
    return resolveFn();
  }
  
  const cachedFn = unstable_cache(
    resolveFn,
    [`gym-host-${normalizedHost}`],
    {
      tags: [`gym-host:${normalizedHost}`],
      revalidate: 600, // 10 minutes
    }
  );
  
  return cachedFn();
}

/**
 * Resolve brand following the 3-tier resolution order:
 * 1. Host-mapped verified gym (host wins)
 * 2. User's active gym membership (member fallback)
 * 3. Base brand (default)
 * 
 * @param supabase Supabase client
 * @param host Hostname from the request (null for no host)
 * @param memberGym Member's gym info (null if no membership)
 * @param base Base brand to use as fallback
 * @param fetchGymBrand Optional fetcher for gym brand (for testing)
 * @param useCache Whether to use unstable_cache for host lookup (default true, false for tests)
 */
export async function resolveBrand(
  supabase: SupabaseClient<Database>,
  host: string | null,
  memberGym: { gymId: string; gymName: string } | null,
  base: Brand,
  fetchGymBrand: (gymId: string) => Promise<Partial<Brand>> = getGymBrand,
  useCache: boolean = true
): Promise<BrandResolution> {
  // Tier 1: Host-mapped verified gym
  if (host) {
    const normalizedHost = host.toLowerCase().split(":")[0];

    // Localhost and vercel preview domains skip tier 1
    const isUnmapped =
      normalizedHost === "localhost" ||
      normalizedHost.endsWith(".vercel.app");

    if (!isUnmapped) {
      const hostResult = await resolveHostToBranding(supabase, normalizedHost, useCache);
      
      if (hostResult) {
        try {
          const gymBrand = await fetchGymBrand(hostResult.gymId);
          const brand = mergeBrand(base, gymBrand);

          return {
            brand,
            gymId: hostResult.gymId,
            gymName: hostResult.gymName,
            tier: "host",
          };
        } catch {
          // On gym brand fetch error, use neutral brand for custom domain
          // (prevents showing another gym's brand during outage)
          const brand = mergeBrand(base, neutralBrand);
          return {
            brand,
            gymId: null,
            gymName: null,
            tier: "neutral",
          };
        }
      }
    }
  }

  // Tier 2: User's active gym membership
  if (memberGym) {
    try {
      const gymBrand = await fetchGymBrand(memberGym.gymId);
      const brand = mergeBrand(base, gymBrand);

      return {
        brand,
        gymId: memberGym.gymId,
        gymName: memberGym.gymName,
        tier: "member",
      };
    } catch {
      // Member resolution failed, continue to base
    }
  }

  // Tier 3: Base brand
  return {
    brand: base,
    gymId: null,
    gymName: null,
    tier: "base",
  };
}

/**
 * Get the runtime brand resolution for the current request.
 * Cached per request via React cache().
 * Follows 3-tier resolution: host → member → base.
 */
export const getRequestBrandResolution = cache(async (): Promise<BrandResolution> => {
  const headersList = await headers();
  const host = headersList.get("host");
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  
  const memberGym = userId ? await getUserGymMembership(supabase, userId) : null;
  
  return resolveBrand(supabase, host, memberGym, branding);
});

/**
 * Get the runtime brand for the current request.
 * Cached per request via React cache().
 */
export const getRequestBrand = cache(async (): Promise<Brand> => {
  const resolution = await getRequestBrandResolution();
  return resolution.brand;
});

/**
 * Merge a partial brand over a base brand.
 * Validates colors (hex), URLs (https or /storage/), and name length.
 * Applies contrast guard: accent must have >= 3:1 contrast against app bg.
 * Uses OKLCH lightness adjustment to raise colors deterministically.
 * Never throws; invalid values are silently ignored.
 */
export function mergeBrand(base: Brand, partial: Partial<Brand>): Brand {
  const merged = { ...base };
  
  // Merge ID
  if (partial.id) {
    merged.id = partial.id;
  }
  
  // Merge name (2-100 chars)
  if (partial.name && partial.name.length >= 2 && partial.name.length <= 100) {
    merged.name = partial.name;
  }
  
  // Merge logo (https:// or /storage/)
  if (partial.logo) {
    const logoStr = String(partial.logo);
    if (logoStr.startsWith("https://") || logoStr.startsWith("/storage/")) {
      merged.logo = logoStr;
    }
  }
  
  // Merge colors (hex only) with OKLCH contrast guard
  if (partial.colors) {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    merged.colors = { ...base.colors };
    
    // App background from base brand config
    const appBg = base.colors.bg;
    const minRatio = 3.0;
    
    // Adjust primary/accent color
    if (partial.colors.accent && hexRegex.test(partial.colors.accent)) {
      const adjusted = ensureMinContrast(
        partial.colors.accent,
        appBg,
        minRatio,
        base.colors.accent
      );
      merged.colors.accent = adjusted;
      
      // Compute accentFg against the ADJUSTED color (not original)
      const accentFg = accessibleTextColor(adjusted);
      merged.colors.accentFg = accentFg;
      // Note: result may be < 4.5:1 WCAG AAA but meets 3:1 minimum
    }
    
    // Adjust accentHover color
    if (partial.colors.accentHover && hexRegex.test(partial.colors.accentHover)) {
      const adjusted = ensureMinContrast(
        partial.colors.accentHover,
        appBg,
        minRatio,
        base.colors.accentHover
      );
      merged.colors.accentHover = adjusted;
    }
  }
  
  return merged;
}
