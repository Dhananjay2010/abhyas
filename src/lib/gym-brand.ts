/**
 * Get public brand fields for a gym (runtime white-label branding handoff to Dev 2).
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/database.types";
import type { Brand } from "@/lib/branding";
import { validateTimezone, branding } from "@/lib/branding";

/**
 * Neutral unbranded fallback for when the database is unreachable
 * on a custom domain (not the app's own domain).
 * 
 * Used as a last-resort fallback when:
 * - The RPC call errors (database outage, network issue)
 * - The host is NOT the app's own domain (not localhost, not *.vercel.app, not NEXT_PUBLIC_SITE_URL)
 * 
 * This prevents gym members from seeing another brand on their gym's domain during an outage.
 * Never cached. Uses generic name and neutral grey colors.
 */
export const neutralBrand: Brand = {
  id: "neutral",
  name: "Fitness",
  shortName: "Fitness",
  description: "Fitness training",
  siteUrl: branding.siteUrl,
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
  icons: branding.icons, // Reuse same icons
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
 * Get public brand fields for a gym (internal implementation).
 *
 * Returns a Partial<Brand> with only the fields available in the database:
 * - name (required, maps to Brand.name and optionally Brand.shortName)
 * - timezone (optional, validated against IANA names)
 *
 * Future migrations (e.g. 000038) will add logo, colors, etc.
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
  const brand: Partial<Brand> = {};

  // Map name to both name and shortName if it's reasonable
  if (row.name) {
    brand.name = row.name;
    // Use the same name for shortName if it's <= 12 chars (home screen recommendation)
    // Otherwise just use the first 12 chars (caller can override)
    brand.shortName = row.name.length <= 12 ? row.name : row.name.slice(0, 12);
  }

  // Validate and include timezone if set
  if (row.timezone) {
    const canonical = validateTimezone(row.timezone);
    if (canonical) {
      brand.timezone = canonical;
    }
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
