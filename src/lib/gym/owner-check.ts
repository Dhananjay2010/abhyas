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

/**
 * Check if the user is the owner of a gym.
 * Returns ownership info including gym details if the user is an owner.
 */
export async function checkGymOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GymOwnership> {
  // Query gym_memberships for owner role
  // LOW-11: Use limit(1) instead of single() to avoid error when user owns multiple gyms
  const { data, error } = await supabase
    .from("gym_memberships")
    .select(
      `
      gym_id,
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
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return {
      isOwner: false,
      gymId: null,
      gymName: null,
      gymSlug: null,
    };
  }

  const row = data[0];
  const gym = Array.isArray(row.gyms) ? row.gyms[0] : row.gyms;

  return {
    isOwner: true,
    gymId: row.gym_id,
    gymName: gym?.name ?? null,
    gymSlug: gym?.slug ?? null,
  };
}
