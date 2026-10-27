/**
 * Runtime gym branding resolution for per-request white-label hosting.
 *
 * Resolves the gym from the request host and merges its brand fields over
 * the build-time base brand. Only VERIFIED gym_domains mappings are returned.
 */

import { headers } from "next/headers";
import { cache } from "react";
import { branding, type Brand, validateTimezone } from "@/lib/branding";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getGymBrand } from "@/lib/gym-brand";
import { accessibleTextColor } from "@/lib/contrast";

/**
 * RPC return type from resolve_gym_by_host
 */
type ResolveGymResult = {
  gym_id: string;
  gym_slug: string;
  gym_name: string;
};

/**
 * Type guard for ResolveGymResult
 */
function isResolveGymResult(row: unknown): row is ResolveGymResult {
  if (typeof row !== 'object' || row === null) return false;
  if (!('gym_id' in row) || typeof row.gym_id !== 'string') return false;
  if (!('gym_slug' in row) || typeof row.gym_slug !== 'string') return false;
  if (!('gym_name' in row) || typeof row.gym_name !== 'string') return false;
  return true;
}

/**
 * Merge a gym's Partial<Brand> over the base brand.
 * Validates colors (hex), URL (https), and name length.
 * Invalid fields fall back to base values; never throws.
 */
function mergeBrand(base: Brand, gym: Partial<Brand>): Brand {
  const merged: Brand = { ...base };

  // Merge name if valid
  if (gym.name && typeof gym.name === 'string' && gym.name.length > 0 && gym.name.length <= 100) {
    merged.name = gym.name;
    merged.shortName = gym.name.length <= 12 ? gym.name : gym.name.slice(0, 12);
  }

  // Merge logo if valid (https:// URL)
  if (gym.logo && typeof gym.logo === 'string' && /^https:\/\/.+/.test(gym.logo)) {
    merged.logo = gym.logo;
  }

  // Merge timezone if valid
  if (gym.timezone && typeof gym.timezone === 'string') {
    const validated = validateTimezone(gym.timezone);
    if (validated) {
      merged.timezone = validated;
    }
  }

  // Merge colors if valid (must have both accent and accentHover)
  if (gym.colors && typeof gym.colors === 'object') {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const accent = gym.colors.accent;
    const accentHover = gym.colors.accentHover;

    if (accent && hexRegex.test(accent) && accentHover && hexRegex.test(accentHover)) {
      merged.colors = {
        ...base.colors,
        accent,
        accentHover,
        accentFg: accessibleTextColor(accent),
      };
    }
  }

  return merged;
}

/**
 * Resolve gym from request host (internal, not cached).
 * Returns gym_id if a verified domain mapping exists, null otherwise.
 */
async function resolveGymFromHost(): Promise<string | null> {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    
    if (!host) {
      return null;
    }

    // Create an anon client (no cookies, no session)
    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await supabase.rpc("resolve_gym_by_host", {
      p_host: host,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    const row = data[0];
    if (!isResolveGymResult(row)) {
      return null;
    }

    return row.gym_id;
  } catch {
    // On error, fall back to base brand
    return null;
  }
}

/**
 * Get the brand for the current request.
 * Wrapped in React cache() so multiple components in one render share the result.
 * 
 * Resolves the gym from the request host, fetches its brand fields, and merges
 * them over the build-time base brand. Unmapped hosts get the base brand
 * (byte-identical to today).
 */
export const getRequestBrand = cache(async (): Promise<Brand> => {
  const gymId = await resolveGymFromHost();

  if (!gymId) {
    // Unmapped host: return base brand
    return branding;
  }

  try {
    const gymBrand = await getGymBrand(gymId);
    return mergeBrand(branding, gymBrand);
  } catch {
    // On error, fall back to base brand
    return branding;
  }
});

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
