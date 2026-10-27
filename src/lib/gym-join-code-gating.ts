/**
 * Role-gating logic for gym join code confirmation UI
 */

export type GymRole = "owner" | "staff" | "member";

const roleOrder: Record<GymRole, number> = {
  owner: 3,
  staff: 2,
  member: 1,
};

export interface JoinGatingResult {
  alreadyInAtSameOrHigher: boolean;
  isMemberUpgradeToStaff: boolean;
}

/**
 * Determines if a user should be blocked or shown an upgrade prompt
 * when trying to redeem a join code.
 * 
 * @param codeGymRole - User's current role in the code's gym (if any)
 * @param codeRole - Role being offered by the join code
 * @returns Decision object for UI rendering
 */
export function determineJoinGating(
  codeGymRole: GymRole | undefined,
  codeRole: GymRole
): JoinGatingResult {
  const alreadyInAtSameOrHigher = codeGymRole !== undefined && 
    (roleOrder[codeGymRole] ?? 0) >= (roleOrder[codeRole] ?? 0);
  
  const isMemberUpgradeToStaff = codeGymRole === "member" && codeRole === "staff";

  return {
    alreadyInAtSameOrHigher,
    isMemberUpgradeToStaff,
  };
}
