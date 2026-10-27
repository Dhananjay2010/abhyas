"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import type { Database } from "@/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];
type GymRole = Database["public"]["Enums"]["gym_role"];

export type CreateCodeResult = 
  | { ok: true; code: JoinCode }
  | { ok: false; error: string };

export type RevokeCodeResult = 
  | { ok: true }
  | { ok: false; error: string };

export async function createJoinCode(
  gymId: string,
  role: GymRole
): Promise<CreateCodeResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return { ok: false, error: rateLimit.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: role,
    p_expires_at: undefined,
    p_max_uses: undefined,
  });

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Failed to create code" };

  const { data: codeRow, error: fetchError } = await supabase
    .from("gym_join_codes")
    .select("*")
    .eq("id", data[0].id)
    .single();

  if (fetchError || !codeRow) return { ok: false, error: "Failed to fetch created code" };

  revalidatePath("/owner/invites");
  return { ok: true, code: codeRow };
}

export async function revokeJoinCode(codeId: string): Promise<RevokeCodeResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return { ok: false, error: rateLimit.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.rpc("revoke_join_code", {
    p_id: codeId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/owner/invites");
  return { ok: true };
}
