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
import { branding, type Brand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getGymBrand } from "@/lib/gym-brand";
import { getUserGymMembership } from "@/lib/gym/member-gym";
import { contrastRatio, accessibleTextColor } from "@/lib/contrast";
import { ensureMinContrast } from "@/lib/brand-contrast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * RPC return type for resolve_gym_by_host (includes verified field)
 */
type ResolveGymByHostResult = {
  gym_id: string;
  gym_slug: string;
  gym_name: string;
  verified: boolean;
};

/**
 * Type guard for resolve_gym_by_host RPC result
 */
function isResolveGymByHostResult(row: unknown): row is ResolveGymByHostResult {
  if (typeof row !== 'object' || row === null) return false;
  if (!('gym_id' in row) || typeof row.gym_id !== 'string') return false;
  if (!('gym_slug' in row) || typeof row.gym_slug !== 'string') return false;
  if (!('gym_name' in row) || typeof row.gym_name !== 'string') return false;
  if (!('verified' in row) || typeof row.verified !== 'boolean') return false;
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
 * Resolve brand following the 3-tier resolution order:
 * 1. Host-mapped verified gym (host wins)
 * 2. User's active gym membership (member fallback)
 * 3. Base brand (default)
 * 
 * @param supabase Supabase client
 * @param host Hostname from the request (null for no host)
 * @param userId User ID if signed in (null for anon)
 * @param base Base brand to use as fallback
 * @param fetchGymBrand Optional fetcher for gym brand (for testing)
 */
export async function resolveBrand(
  supabase: SupabaseClient<Database>,
  host: string | null,
  userId: string | null,
  base: Brand,
  fetchGymBrand: (gymId: string) => Promise<Partial<Brand>> = getGymBrand
): Promise<BrandResolution> {
  // Tier 1: Host-mapped verified gym
  if (host) {
    const normalizedHost = host.toLowerCase().split(":")[0];

    // Localhost and vercel preview domains skip tier 1
    const isUnmapped =
      normalizedHost === "localhost" ||
      normalizedHost.endsWith(".vercel.app");

    if (!isUnmapped) {
      try {
        const { data, error } = await supabase.rpc("resolve_gym_by_host", {
          p_host: normalizedHost,
        });

        if (!error && data && data.length > 0) {
          const row = data[0];
          
          if (!isResolveGymByHostResult(row)) {
            console.error("Invalid RPC response format:", row);
          } else if (row.verified && row.gym_id) {
            const gymBrand = await fetchGymBrand(row.gym_id);
            const brand = mergeBrand(base, gymBrand);

            return {
              brand,
              gymId: row.gym_id,
              gymName: row.gym_name || null,
              tier: "host",
            };
          }
        }
      } catch (err) {
        console.error("Host resolution error:", err);
      }
    }
  }

  // Tier 2: User's active gym membership
  if (userId) {
    try {
      const membership = await getUserGymMembership(supabase, userId);

      if (membership) {
        const gymBrand = await fetchGymBrand(membership.gymId);
        const brand = mergeBrand(base, gymBrand);

        return {
          brand,
          gymId: membership.gymId,
          gymName: membership.gymName,
          tier: "member",
        };
      }
    } catch (err) {
      console.error("Member gym resolution error:", err);
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
  
  return resolveBrand(supabase, host, userId, branding);
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
      
      // Verify fg contrast is 4.5:1 or better
      const fgRatio = contrastRatio(accentFg, adjusted);
      if (fgRatio < 4.5) {
        console.warn(`accentFg contrast ${fgRatio.toFixed(2)} < 4.5:1 for ${adjusted}`);
      }
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

/**
 * Get CSS variable declarations for a brand's colors.
 * Returns a string suitable for inline <style> injection.
 * 
 * Security: All colors are validated as strict hex codes.
 */
export function getBrandCssVariablesForBrand(brand: Brand): string {
  // Validate all colors are strict hex codes (defense in depth)
  const colorEntries = Object.entries(brand.colors);
  for (const [key, value] of colorEntries) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(
        `Brand ${brand.id}: colors.${key} must be a strict 6-digit hex code for CSS injection safety (got: ${value})`
      );
    }
  }

  return [
    `--color-accent: ${brand.colors.accent};`,
    `--color-accent-hover: ${brand.colors.accentHover};`,
    `--color-accent-fg: ${brand.colors.accentFg};`,
    `--color-bg: ${brand.colors.bg};`,
    `--color-surface: ${brand.colors.surface};`,
    `--color-surface-2: ${brand.colors.surface2};`,
    `--color-border: ${brand.colors.border};`,
    `--color-fg: ${brand.colors.fg};`,
    `--color-muted: ${brand.colors.muted};`,
    `--color-success: ${brand.colors.success};`,
    `--color-warning: ${brand.colors.warning};`,
    `--color-warning-fg: ${brand.colors.warningFg};`,
    `--color-danger: ${brand.colors.danger};`,
    `--color-chart: ${brand.colors.chart};`,
  ].join(" ");
}
