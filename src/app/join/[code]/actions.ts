"use server";

import { getAuthedClient } from "@/lib/supabase/auth";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";

export type RedeemCodeResult = 
  | { ok: true }
  | { ok: false; error: string };

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
