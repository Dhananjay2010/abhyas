"use server";

import { getAuthedClient } from "@/lib/supabase/auth";
import { mapDbErrorToMessage, processRedeemResult, type RedeemCodeResult } from "@/lib/redeem-join-code-errors";

export type { RedeemCodeResult };

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: mapDbErrorToMessage(error) };
  }

  // Look up gym name server-side for personalized error messages
  const { data: gymData } = await supabase
    .from("gym_join_codes")
    .select("gyms(name)")
    .eq("code", code)
    .single();
  
  const gymName = gymData?.gyms && !Array.isArray(gymData.gyms) ? gymData.gyms.name : undefined;

  return processRedeemResult(data, gymName);
}
