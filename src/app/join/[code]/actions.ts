"use server";

import { getAuthedClient } from "@/lib/supabase/auth";
import { mapDbErrorToMessage, processRedeemResult, type RedeemCodeResult } from "@/lib/redeem-join-code-errors";
import { parsePreviewJoinCodeResult } from "@/lib/gym-join-code-types";

export type { RedeemCodeResult };

export async function redeemJoinCode(code: string): Promise<RedeemCodeResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  // Look up gym name server-side via preview RPC (SECURITY DEFINER, bypasses RLS)
  // Normalize code same way the RPC does (upper())
  const normalizedCode = code.toUpperCase();
  const { data: previewData, error: previewError } = await supabase.rpc("preview_join_code", {
    p_code: normalizedCode,
  });

  if (previewError) {
    return { ok: false, error: mapDbErrorToMessage(previewError) };
  }

  const previewResult = parsePreviewJoinCodeResult(previewData);
  const gymName = previewResult?.ok ? previewResult.gym_name : undefined;

  // Redeem the code
  const { data, error } = await supabase.rpc("redeem_join_code", {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: mapDbErrorToMessage(error) };
  }

  return processRedeemResult(data, gymName);
}
