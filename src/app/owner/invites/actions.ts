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

function mapDbErrorToMessage(error: { code?: string; message?: string }): string {
  if (!error.code && !error.message) return "An error occurred";
  
  const code = error.code || "";
  const message = error.message || "";
  
  // Custom GJC error codes
  if (code === "GJC00" || message.includes("Not authenticated")) {
    return "You must be signed in";
  }
  
  if (code === "GJC01" || message.includes("Failed to generate unique code")) {
    return "Unable to generate code. Please try again";
  }
  
  if (code === "GJC02" || message.includes("Invalid code")) {
    return "This code is invalid, expired, or no longer available";
  }
  
  if (code === "GJC03" || message.includes("Only gym owners")) {
    return "Only gym owners can perform this action";
  }
  
  if (code === "GJC04" || message.includes("Role must be")) {
    return "Invalid role specified";
  }
  
  if (code === "GJC05" || message.includes("Expiry must be")) {
    return "Expiry date must be in the future";
  }
  
  if (code === "GJC06" || message.includes("Max uses must be")) {
    return "Max uses must be at least 1";
  }
  
  if (code === "GJC07" || message.includes("Code not found")) {
    return "Code not found";
  }
  
  if (code === "GJC10" || message.includes("Too many failed attempts")) {
    return "Too many failed attempts. Please try again later";
  }
  
  // Standard Postgres errors
  if (code === "23505" || message.includes("duplicate key") || message.includes("unique constraint")) {
    return "You're already a member of this gym";
  }
  
  if (code === "23503" || message.includes("foreign key")) {
    return "Invalid reference. Please refresh and try again";
  }
  
  return "An error occurred. Please try again";
}

export async function createJoinCode(
  gymId: string,
  role: GymRole,
  expiresAt?: string,
  maxUses?: number
): Promise<CreateCodeResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit && !rateLimit.ok) return { ok: false, error: rateLimit.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: role,
    ...(expiresAt && { p_expires_at: expiresAt }),
    ...(maxUses && { p_max_uses: maxUses }),
  });

  if (error) return { ok: false, error: mapDbErrorToMessage(error) };
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
  if (rateLimit && !rateLimit.ok) return { ok: false, error: rateLimit.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.rpc("revoke_join_code", {
    p_id: codeId,
  });

  if (error) return { ok: false, error: mapDbErrorToMessage(error) };

  revalidatePath("/owner/invites");
  return { ok: true };
}
