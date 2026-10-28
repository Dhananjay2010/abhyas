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
 * Membership preference (avoids showing default gym brand to owners):
 * 1. role='member' in a NON-default gym (joined_at ASC, then gym_id ASC)
 * 2. role='owner' or 'staff' in a NON-default gym (joined_at ASC, then gym_id ASC)
 * 3. Any membership in the default gym (slug='default')
 * 
 * Rationale: Every signup gets an auto 'member' row in the default gym (migration 035).
 * Owners and staff of other gyms should see their gym's brand, not default.
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
        name,
        slug
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

  const gym = (m: typeof data[0]) => 
    Array.isArray(m.gyms) ? m.gyms[0] : m.gyms;

  // Tier 1: role='member' in a NON-default gym
  const nonDefaultMember = data.find(
    (m) => m.role === "member" && gym(m)?.slug !== "default"
  );
  if (nonDefaultMember) {
    const g = gym(nonDefaultMember);
    return {
      gymId: nonDefaultMember.gym_id,
      gymName: g?.name ?? "Unknown Gym",
    };
  }

  // Tier 2: role='owner' or 'staff' in a NON-default gym (already sorted by joined_at ASC, gym_id ASC)
  const nonDefaultOwnerStaff = data.find(
    (m) =>
      (m.role === "owner" || m.role === "staff") && gym(m)?.slug !== "default"
  );
  if (nonDefaultOwnerStaff) {
    const g = gym(nonDefaultOwnerStaff);
    return {
      gymId: nonDefaultOwnerStaff.gym_id,
      gymName: g?.name ?? "Unknown Gym",
    };
  }

  // Tier 3: Any membership (fallback to default gym)
  const membership = data[0];
  const g = gym(membership);

  return {
    gymId: membership.gym_id,
    gymName: g?.name ?? "Unknown Gym",
  };
}
