"use server";

import { getAuthedClient } from "@/lib/supabase/auth";
import { parseRedeemJoinCodeResult, type RedeemJoinCodeResult } from "@/lib/gym-join-code-types";
import { mapRedeemResultToMessage } from "@/lib/gym-join-code-messages";

export type RedeemCodeResult = 
  | { ok: true; gymName?: string }
  | { ok: false; error: string };

function mapDbErrorToMessage(error: { code?: string; message?: string }): string {
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

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: mapDbErrorToMessage(error) };
  }

  // Parse jsonb result with type guard
  const result = parseRedeemJoinCodeResult(data);
  
  if (!result) {
    return { ok: false, error: "Invalid response from server" };
  }
  
  if (!result.ok) {
    const errorMessage = mapRedeemResultToMessage(result);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, gymName: result.gym_name };
}
