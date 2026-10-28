/**
 * Check if the current user is a gym owner
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type GymOwnership = {
  isOwner: boolean;
  gymId: string | null;
  gymName: string | null;
  gymSlug: string | null;
};

type GymMembershipRow = {
  gym_id: string;
  joined_at?: string;
  gyms: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

/**
 * Pick the appropriate gym from a user's owner memberships.
 * Rule: prefer non-default slug, then oldest joined_at, then smallest gym_id.
 * Returns the chosen row, or null if no rows.
 */
export function pickOwnedGym(rows: GymMembershipRow[]): GymMembershipRow | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  // Normalize gyms relation to always be an object
  const normalized = rows.map((row) => ({
    ...row,
    gym: Array.isArray(row.gyms) ? row.gyms[0] : row.gyms,
  }));

  // Sort by: 1) non-default slug first, 2) oldest joined_at, 3) smallest gym_id
  const sorted = [...normalized].sort((a, b) => {
    const aSlug = a.gym?.slug ?? "";
    const bSlug = b.gym?.slug ?? "";
    
    // Rule 1: Prefer non-default slug
    const aIsDefault = aSlug === "default";
    const bIsDefault = bSlug === "default";
    if (aIsDefault !== bIsDefault) {
      return aIsDefault ? 1 : -1;
    }
    
    // Rule 2: Oldest joined_at
    const aJoined = a.joined_at ?? "";
    const bJoined = b.joined_at ?? "";
    if (aJoined !== bJoined) {
      return aJoined < bJoined ? -1 : 1;
    }
    
    // Rule 3: Smallest gym_id (string compare)
    return a.gym_id < b.gym_id ? -1 : a.gym_id > b.gym_id ? 1 : 0;
  });

  return sorted[0];
}

/**
 * Check if the user is the owner of a gym.
 * Returns ownership info including gym details if the user is an owner.
 */
export async function checkGymOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GymOwnership> {
  // Query gym_memberships for all active owner roles
  const { data, error } = await supabase
    .from("gym_memberships")
    .select(
      `
      gym_id,
      joined_at,
      role,
      status,
      gyms (
        name,
        slug
      )
    `,
    )
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");

  if (error || !data || data.length === 0) {
    return {
      isOwner: false,
      gymId: null,
      gymName: null,
      gymSlug: null,
    };
  }

  const chosen = pickOwnedGym(data);
  if (!chosen) {
    return {
      isOwner: false,
      gymId: null,
      gymName: null,
      gymSlug: null,
    };
  }

  const gym = Array.isArray(chosen.gyms) ? chosen.gyms[0] : chosen.gyms;

  return {
    isOwner: true,
    gymId: chosen.gym_id,
    gymName: gym?.name ?? null,
    gymSlug: gym?.slug ?? null,
  };
}
