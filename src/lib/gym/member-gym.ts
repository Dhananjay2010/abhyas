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
 * 
 * For users with multiple active memberships (owners/staff):
 * - Prefers role 'member' over 'owner'/'staff'
 * - Then prefers oldest joined_at (first membership)
 * - Tie-breaks by gym_id (deterministic ordering)
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
      role,
      joined_at,
      gyms (
        name
      )
    `,
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .order("gym_id", { ascending: true });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Prefer role 'member', then oldest joined_at
  const memberRole = data.find((m) => m.role === "member");
  const membership = memberRole ?? data[0];

  const gym = Array.isArray(membership.gyms) ? membership.gyms[0] : membership.gyms;

  return {
    gymId: membership.gym_id,
    gymName: gym?.name ?? "Unknown Gym",
  };
}
