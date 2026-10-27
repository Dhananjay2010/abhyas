"use server";

import { getAuthedClient } from "@/lib/supabase/auth";
import { checkJoinCodeThrottle, recordJoinCodeMiss } from "@/lib/rate-limit/join-code-throttle";

export type RedeemCodeResult = 
  | { ok: true }
  | { ok: false; error: string };

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  // Check throttle (only misses count)
  const throttleError = await checkJoinCodeThrottle(user.id);
  if (throttleError) {
    // This is a reject due to throttle, not a miss, so don't increment
    return { ok: false, error: throttleError };
  }

  const { error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) {
    // Record this as a miss (only failed attempts count)
    await recordJoinCodeMiss(user.id);
    return { ok: false, error: error.message };
  }

  // Success - do NOT increment counter
  return { ok: true };
}
