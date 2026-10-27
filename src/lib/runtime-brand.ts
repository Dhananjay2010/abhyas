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
import { contrastRatio } from "@/lib/contrast";
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
          const resolution = data[0] as ResolveGymByHostResult;

          if (resolution.verified && resolution.gym_id) {
            const gymBrand = await fetchGymBrand(resolution.gym_id);
            const brand = mergeBrand(base, gymBrand);

            return {
              brand,
              gymId: resolution.gym_id,
              gymName: resolution.gym_name || null,
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
  
  // Merge colors (hex only) with contrast guard
  if (partial.colors) {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    merged.colors = { ...base.colors };
    
    // Contrast guard: accent must have >= 3:1 contrast against app bg
    // App bg is base.colors.bg (#0a0c0e for default brand)
    const appBg = base.colors.bg;
    
    if (partial.colors.accent && hexRegex.test(partial.colors.accent)) {
      const ratio = contrastRatio(partial.colors.accent, appBg);
      if (ratio >= 3.0) {
        merged.colors.accent = partial.colors.accent;
      }
      // If contrast < 3:1, fall back to base.colors.accent (buttons remain visible)
    }
    
    if (partial.colors.accentHover && hexRegex.test(partial.colors.accentHover)) {
      const ratio = contrastRatio(partial.colors.accentHover, appBg);
      if (ratio >= 3.0) {
        merged.colors.accentHover = partial.colors.accentHover;
      }
    }
    
    if (partial.colors.accentFg && hexRegex.test(partial.colors.accentFg)) {
      merged.colors.accentFg = partial.colors.accentFg;
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
