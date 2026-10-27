/**
 * Splits join codes into active and inactive lists.
 */

import type { Database } from "./database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

export interface SplitJoinCodes {
  active: JoinCode[];
  inactive: JoinCode[];
}

/**
 * Determines if a join code is active (not revoked, expired, or exhausted).
 */
export function isCodeActive(code: JoinCode): boolean {
  if (code.revoked_at) return false;
  if (code.expires_at && new Date(code.expires_at) <= new Date()) return false;
  if (code.max_uses !== null && code.use_count >= code.max_uses) return false;
  return true;
}

/**
 * Splits join codes into active and inactive lists.
 * Inactive codes are those that are revoked, expired, or exhausted.
 */
export function splitJoinCodes(codes: JoinCode[]): SplitJoinCodes {
  const active: JoinCode[] = [];
  const inactive: JoinCode[] = [];
  
  for (const code of codes) {
    if (isCodeActive(code)) {
      active.push(code);
    } else {
      inactive.push(code);
    }
  }
  
  return { active, inactive };
}
