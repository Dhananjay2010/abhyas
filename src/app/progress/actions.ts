"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";

export type LogWeightResult = { ok: true } | { ok: false; error: string };

export async function logBodyWeight(weightKg: number): Promise<LogWeightResult> {
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
    return { ok: false, error: "Weight should be between 25 and 300 kg." };
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
  
  // Validate in user's display unit for inclusive bounds
  // Imperial: 55-661 lb (client shows this range)
  // Metric: 25-300 kg
  if (units === "imperial") {
    const { kgToLb } = await import("@/lib/units");
    const displayLb = kgToLb(weightKg);
    if (displayLb < 55 || displayLb > 661) {
      return { ok: false, error: "Weight should be between 55 and 661 lb." };
    }
  } else {
    if (weightKg < 25 || weightKg > 300) {
      return { ok: false, error: "Weight should be between 25 and 300 kg." };
    }
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
