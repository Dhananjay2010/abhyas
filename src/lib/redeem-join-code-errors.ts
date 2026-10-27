/**
 * Error message mapping for join code redemption.
 * Separated from server actions for testability.
 */

import { parseRedeemJoinCodeResult } from "./gym-join-code-types";
import { mapRedeemResultToMessage } from "./gym-join-code-messages";

export type RedeemCodeResult = 
  | { ok: true; gymName?: string }
  | { ok: false; error: string };

/**
 * Maps database errors to user-facing messages.
 */
export function mapDbErrorToMessage(error: { code?: string; message?: string }): string {
  if (!error.code && !error.message) return "An error occurred";
  
  const code = error.code || "";
  const message = error.message || "";
  
  if (code === "GJC00" || message.includes("Not authenticated")) {
    return "You must be signed in";
  }
  
  if (code === "GJC11" || message.includes("Read-only")) {
    return "Invalid request method";
  }
  
  if (code === "23505" || message.includes("duplicate key") || message.includes("unique constraint")) {
    return "Unable to process this request. You may already be a member";
  }
  
  return "An error occurred. Please try again";
}

/**
 * Processes a redeem join code RPC result and maps it to a user-facing result.
 * Uses gym_name from the server result (already_member includes it, success includes it).
 */
export function processRedeemResult(data: unknown): RedeemCodeResult {
  const result = parseRedeemJoinCodeResult(data);
  
  if (!result) {
    return { ok: false, error: "Invalid response from server" };
  }
  
  if (!result.ok) {
    const serverGymName = result.gym_name;
    const errorMessage = mapRedeemResultToMessage(result, serverGymName);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, gymName: result.gym_name };
}
