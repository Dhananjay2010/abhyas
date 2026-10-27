import type { RedeemJoinCodeResult } from "./gym-join-code-types";

/**
 * Maps a redeem join code result to a user-facing error message.
 * Returns empty string for success, specific message for each failure reason.
 */
export function mapRedeemResultToMessage(result: RedeemJoinCodeResult, gymName?: string): string {
  if (result.ok) return "";
  
  const reason = result.reason;
  
  if (reason === "invalid") {
    return "This code is invalid or no longer available";
  }
  
  if (reason === "expired") {
    return "This code has expired";
  }
  
  if (reason === "revoked") {
    return "This code has been revoked";
  }
  
  if (reason === "exhausted") {
    return "This code has reached its maximum uses";
  }
  
  if (reason === "throttled") {
    return "Too many attempts. Please try again in a few minutes";
  }
  
  if (reason === "already_member") {
    return gymName ? `You're already in ${gymName}` : "You're already a member of this gym";
  }
  
  // Exhaustive check: if we reach here, TypeScript will error on a new reason
  const _exhaustive: never = reason;
  return "An error occurred. Please try again";
}
