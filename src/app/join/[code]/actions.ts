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

  return processRedeemResult(data);
}
