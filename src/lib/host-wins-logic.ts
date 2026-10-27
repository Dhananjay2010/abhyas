/**
 * Host-wins notice logic (pure function).
 * 
 * Determines if the host-wins notice should be shown based on:
 * - Current tier is 'host' (host-mapped domain)
 * - User has an active gym membership
 * - Host gym ID differs from member gym ID
 */

import type { BrandResolution } from "./runtime-brand";
import type { UserGymMembership } from "./gym/member-gym";

export type HostWinsNoticeProps = {
  userGymName: string | null;
  hostGymName: string | null;
};

/**
 * Determine if host-wins notice should be shown.
 * Pure function that compares gym IDs, not names.
 * 
 * @param resolution Brand resolution (includes tier and gym ID)
 * @param memberGym User's gym membership (null if not a member)
 * @returns Props for HostWinsNotice (both null if notice should not show)
 */
export function getHostWinsNoticeProps(
  resolution: BrandResolution,
  memberGym: UserGymMembership
): HostWinsNoticeProps {
  // Only show notice in tier "host" (host wins)
  if (resolution.tier !== "host") {
    return { userGymName: null, hostGymName: null };
  }
  
  // Need both host gym and member gym
  if (!resolution.gymId || !memberGym) {
    return { userGymName: null, hostGymName: null };
  }
  
  // Compare gym IDs (not names)
  if (resolution.gymId === memberGym.gymId) {
    return { userGymName: null, hostGymName: null };
  }
  
  // Different gyms: show notice
  return {
    userGymName: memberGym.gymName,
    hostGymName: resolution.gymName,
  };
}
