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
    .single();

  if (error || !data) {
    return {
      isOwner: false,
      gymId: null,
      gymName: null,
      gymSlug: null,
    };
  }

  const gym = Array.isArray(data.gyms) ? data.gyms[0] : data.gyms;

  return {
    isOwner: true,
    gymId: data.gym_id,
    gymName: gym?.name ?? null,
    gymSlug: gym?.slug ?? null,
  };
}
