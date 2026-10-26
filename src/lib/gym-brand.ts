/**
 * Get public brand fields for a gym (runtime white-label branding handoff to Dev 2).
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/database.types";
import type { Brand } from "@/lib/branding";
import { validateTimezone } from "@/lib/branding";

/**
 * Return the cache tag string for a gym's brand.
 * Use this tag with revalidateTag() when the gym's branding is updated.
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
 * - Returns {} when the gym is not found or has no public brand data
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
    console.error("Failed to get gym brand:", error);
    return {};
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
 * To invalidate: revalidateTag(gymBrandTag(gymId)).
 */
export function getGymBrand(gymId: string): Promise<Partial<Brand>> {
  return unstable_cache(
    async () => getGymBrandInternal(gymId),
    [`gym-brand-${gymId}`],
    {
      tags: [gymBrandTag(gymId)],
      revalidate: false, // Only revalidate via revalidateTag
    },
  )();
}
