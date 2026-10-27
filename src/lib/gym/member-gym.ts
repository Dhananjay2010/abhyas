/**
 * Get user's active gym membership.
 * Returns gym ID and name for the user's gym, or null if not a member.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type UserGymMembership = {
  gymId: string;
  gymName: string;
} | null;

/**
 * Get the gym ID and name for the user's active membership.
 * Returns null if the user has no active gym membership.
 */
export async function getUserGymMembership(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserGymMembership> {
  const { data, error } = await supabase
    .from("gym_memberships")
    .select(
      `
      gym_id,
      gyms (
        name
      )
    `,
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !data) {
    return null;
  }

  const gym = Array.isArray(data.gyms) ? data.gyms[0] : data.gyms;

  return {
    gymId: data.gym_id,
    gymName: gym?.name ?? "Unknown Gym",
  };
}
