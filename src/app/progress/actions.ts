"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { 
  validateBodyWeightKg, 
  BODY_WEIGHT_LB_MIN, 
  BODY_WEIGHT_LB_MAX, 
  WEIGHT_KG_MIN, 
  WEIGHT_KG_MAX 
} from "@/lib/units";

export type LogWeightResult = { ok: true } | { ok: false; error: string };

export async function logBodyWeight(weightKg: number): Promise<LogWeightResult> {
  if (!Number.isFinite(weightKg)) {
    return { ok: false, error: "Invalid weight value." };
  }

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };
  
  // Fetch user's units for display-unit validation
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, units")
    .eq("id", user.id)
    .single();
  
  const units = (profile?.units === "imperial" || profile?.units === "metric") 
    ? profile.units 
    : "metric";
  
  // Validate body weight with unit-specific bounds (inclusive in display units)
  if (!validateBodyWeightKg(weightKg, units)) {
    if (units === "imperial") {
      return { ok: false, error: `Weight should be between ${BODY_WEIGHT_LB_MIN} and ${BODY_WEIGHT_LB_MAX} lb.` };
    }
    return { ok: false, error: `Weight should be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.` };
  }

  // One weigh-in per local day; logging again replaces it.
  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  const { error } = await supabase.from("body_metrics").upsert(
    {
      user_id: user.id,
      recorded_on: localDateString(timezone),
      weight_kg: weightKg,
    },
    { onConflict: "user_id,recorded_on" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}
