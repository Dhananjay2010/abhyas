"use server";

import { getAuthedClient } from "@/lib/supabase/auth";

export type RedeemCodeResult = 
  | { ok: true }
  | { ok: false; error: string };

function mapRedeemResultToMessage(result: { ok: boolean; reason?: string; gym_id?: string; gym_name?: string } | null): string {
  if (!result) return "An error occurred";
  
  if (result.ok) return ""; // Success
  
  const reason = result.reason || "";
  
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
  
  return "An error occurred. Please try again";
}

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

  // Handle jsonb result
  const result = data as { ok: boolean; reason?: string; gym_id?: string; gym_name?: string } | null;
  
  if (!result || !result.ok) {
    const errorMessage = mapRedeemResultToMessage(result);
    return { ok: false, error: errorMessage };
  }

  return { ok: true };
}
