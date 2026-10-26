"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { logBodyWeightCore, type LogBodyWeightResult } from "@/lib/progress/log-bodyweight-core";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

export type LogWeightResult = LogBodyWeightResult;

export async function logBodyWeight(weightKg: number): Promise<LogWeightResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };
  
  // Fetch timezone for local date
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  
  const result = await logBodyWeightCore(supabase, user.id, weightKg, timezone);
  
  if (result.ok) {
    revalidatePath("/progress");
  }
  
  return result;
}
