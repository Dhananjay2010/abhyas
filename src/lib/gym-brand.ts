/**
 * Get public brand fields for a gym (runtime white-label branding handoff to Dev 2).
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/database.types";
import type { Brand } from "@/lib/branding";
import { validateTimezone, branding } from "@/lib/branding";
import { accessibleTextColor } from "@/lib/contrast";

/**
 * Neutral unbranded fallback for when the database is unreachable
 * on a custom domain (not the app's own domain).
 * 
 * Used as a last-resort fallback when:
 * - The RPC call errors (database outage, network issue)
 * - The host is NOT the app's own domain (not localhost, not *.vercel.app, not NEXT_PUBLIC_SITE_URL)
 * 
 * This prevents gym members from seeing another brand on their gym's domain during an outage.
 * Never cached. Uses generic name, neutral grey colors, and generic icons.
 */
export const neutralBrand: Brand = {
  id: "neutral",
  name: "Fitness",
  shortName: "Fitness",
  description: "Fitness training",
  siteUrl: "",
  timezone: branding.timezone,
  defaultUnits: branding.defaultUnits,
  colors: {
    accent: "#6b7280",       // neutral grey-500
    accentHover: "#4b5563",  // neutral grey-600
    accentFg: "#ffffff",     // white
    bg: "#0a0c0e",           // same as branding.colors.bg
    surface: "#1a1a1a",      // neutral grey-900
    surface2: "#262626",     // neutral grey-800
    border: "#525252",       // neutral grey-600
    fg: "#fafafa",           // neutral grey-50
    muted: "#a3a3a3",        // neutral grey-400
    success: "#4ade80",      // keep functional colors same
    warning: "#fbbf24",
    warningFg: "#1a1000",
    danger: "#f87171",
    chart: "#6b7280",        // neutral grey-500
  },
  icons: {
    icon192: "",
    icon512: "",
    maskable192: "",
    maskable512: "",
    appleTouchIcon: "",
    favicon: "",
  },
};

/**
 * Return the cache tag string for a gym's brand.
 * Use this tag with updateTag(gymBrandTag(gymId)) when the gym's branding is updated.
 * (Next.js 16: updateTag is the preferred API from server actions)
 */
export function gymBrandTag(gymId: string): string {
  return `gym-brand:${gymId}`;
}

/**
 * RPC return type from get_gym_brand
 */
type GymBrandRow = {
  name: string;
  slug: string;
  timezone: string | null;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

/**
 * Type guard for GymBrandRow
 * 
 * Brand fields (display_name, logo_url, primary_color, accent_color) may be
 * missing (undefined) in pre-040 RPC mocks or responses, and are treated as null.
 */
function isGymBrandRow(row: unknown): row is GymBrandRow {
  if (typeof row !== 'object' || row === null) return false;
  if (!('name' in row) || typeof row.name !== 'string') return false;
  if (!('slug' in row) || typeof row.slug !== 'string') return false;
  
  // timezone is optional (may be null or missing)
  if ('timezone' in row && row.timezone !== null && typeof row.timezone !== 'string') {
    return false;
  }
  
  // Brand fields are optional (may be null or missing, treated as null)
  if ('display_name' in row && row.display_name !== null && typeof row.display_name !== 'string') {
    return false;
  }
  if ('logo_url' in row && row.logo_url !== null && typeof row.logo_url !== 'string') {
    return false;
  }
  if ('primary_color' in row && row.primary_color !== null && typeof row.primary_color !== 'string') {
    return false;
  }
  if ('accent_color' in row && row.accent_color !== null && typeof row.accent_color !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Get public brand fields for a gym (internal implementation).
 *
 * Returns a Partial<Brand> with fields from the database:
 * - name (required, maps to Brand.name and optionally Brand.shortName)
 * - timezone (optional, validated against IANA names)
 * - display_name, logo_url, primary_color, accent_color (from 000040 migration)
 *
 * This function:
 * - Uses an anon client (no cookies/session) since brand data is public
 * - Validates the timezone against IANA names
 * - Throws on RPC errors (not cached)
 * - Returns {} when the gym is not found
 */
async function getGymBrandInternal(gymId: string): Promise<Partial<Brand>> {
  // Create an anon client (no cookies, no session)
  // Brand data is public, so we don't need authentication
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

  const { data, error } = await supabase.rpc("get_gym_brand", {
    p_gym_id: gymId,
  });

  if (error) {
    // Throw so the error is not cached
    throw new Error(`Failed to get gym brand: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {};
  }

  const row = data[0];
  if (!isGymBrandRow(row)) {
    throw new Error(`Invalid gym brand row structure for gym ${gymId}`);
  }
  
  // Normalize undefined to null for optional brand fields (pre-040 RPC mocks may omit them)
  const normalizedRow: GymBrandRow = {
    name: row.name,
    slug: row.slug,
    timezone: 'timezone' in row ? row.timezone ?? null : null,
    display_name: 'display_name' in row ? row.display_name ?? null : null,
    logo_url: 'logo_url' in row ? row.logo_url ?? null : null,
    primary_color: 'primary_color' in row ? row.primary_color ?? null : null,
    accent_color: 'accent_color' in row ? row.accent_color ?? null : null,
  };
  
  const brand: Partial<Brand> = {};

  // Map name to both name and shortName if it's reasonable
  // Prefer display_name if set, otherwise use name
  const displayName = normalizedRow.display_name || normalizedRow.name;
  if (displayName) {
    brand.name = displayName;
    // Use the same name for shortName if it's <= 12 chars (home screen recommendation)
    // Otherwise just use the first 12 chars (caller can override)
    brand.shortName = displayName.length <= 12 ? displayName : displayName.slice(0, 12);
  }

  // Validate and include timezone if set
  if (normalizedRow.timezone) {
    const canonical = validateTimezone(normalizedRow.timezone);
    if (canonical) {
      brand.timezone = canonical;
    }
  }

  // Include logo if set
  if (normalizedRow.logo_url) {
    brand.logo = normalizedRow.logo_url;
  }

  // Include colors if both are set (partial brand colors aren't useful)
  if (normalizedRow.primary_color && normalizedRow.accent_color) {
    brand.colors = {
      // Use gym's custom colors where provided
      accent: normalizedRow.primary_color,
      accentHover: normalizedRow.accent_color,
      // Derive accessible text color for buttons based on primary color (WCAG AA 4.5:1)
      accentFg: accessibleTextColor(normalizedRow.primary_color),
      // Keep defaults for other colors from branding config
      bg: branding.colors.bg,
      surface: branding.colors.surface,
      surface2: branding.colors.surface2,
      border: branding.colors.border,
      fg: branding.colors.fg,
      muted: branding.colors.muted,
      success: branding.colors.success,
      warning: branding.colors.warning,
      warningFg: branding.colors.warningFg,
      danger: branding.colors.danger,
      chart: branding.colors.chart,
    };
  }

  return brand;
}

/**
 * Get public brand fields for a gym.
 *
 * Cached with Next.js unstable_cache using the gym-brand:<gymId> tag.
 * On RPC errors, falls back to the neutral brand for that request only (error not cached).
 * The neutral brand prevents gym members from seeing another brand during an outage.
 * Cache expires after 600s (not-found results aren't cached forever).
 * 
 * To invalidate: updateTag(gymBrandTag(gymId)) from a server action.
 */
export async function getGymBrand(gymId: string): Promise<Partial<Brand>> {
  const cachedFn = unstable_cache(
    async () => getGymBrandInternal(gymId),
    [`gym-brand-${gymId}`],
    {
      tags: [gymBrandTag(gymId)],
      revalidate: 600, // 10 minutes
    },
  );

  try {
    return await cachedFn();
  } catch (error) {
    // RPC error during outage: fall back to neutral brand for this request only
    // The error is not cached, so a later success will return the real brand
    // Neutral brand prevents gym members from seeing another brand on their domain
    console.error(`getGymBrand error for ${gymId}, falling back to neutral brand:`, error);
    return neutralBrand;
  }
}
