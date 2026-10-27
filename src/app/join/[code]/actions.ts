"use server";

import { getAuthedClient } from "@/lib/supabase/auth";

export type RedeemCodeResult = 
  | { ok: true }
  | { ok: false; error: string };

function mapDbErrorToMessage(error: { code?: string; message?: string }): string {
  if (!error.code && !error.message) return "An error occurred";
  
  const code = error.code || "";
  const message = error.message || "";
  
  if (code === "PAUTH" || message.includes("Not authenticated")) {
    return "You must be signed in";
  }
  
  if (code === "PCODE" || message.includes("Invalid code")) {
    return "This code is invalid, expired, or no longer available";
  }
  
  if (code === "P0001" || message.includes("Too many failed attempts")) {
    return "Too many failed attempts. Please try again later";
  }
  
  if (code === "23505" || message.includes("duplicate key") || message.includes("unique constraint")) {
    return "You're already a member of this gym";
  }
  
  return "An error occurred. Please try again";
}

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: mapDbErrorToMessage(error) };
  }

  return { ok: true };
}
