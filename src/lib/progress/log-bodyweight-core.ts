/**
 * Core logic for logging body weight.
 * Extracted for testing with injected client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { 
  validateBodyWeightKg, 
  BODY_WEIGHT_LB_MIN, 
  BODY_WEIGHT_LB_MAX, 
  WEIGHT_KG_MIN, 
  WEIGHT_KG_MAX 
} from "@/lib/units";
import { getProfileUnits } from "@/lib/get-profile-units";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

export type LogBodyWeightResult = { ok: true } | { ok: false; error: string };

// Minimal structural interface for database methods used by logBodyWeightCore.
// Real SupabaseClient satisfies this at call sites via narrowing cast.
export type LogBodyWeightDb = Pick<SupabaseClient, "from">;

export async function logBodyWeightCore(
  client: LogBodyWeightDb,
  userId: string,
  weightKg: number,
  timezone?: string
): Promise<LogBodyWeightResult> {
  if (!Number.isFinite(weightKg)) {
    return { ok: false, error: "Invalid weight value." };
  }

  const units = await getProfileUnits(client as SupabaseClient, userId);
  
  if (!validateBodyWeightKg(weightKg, units)) {
    if (units === "imperial") {
      return { ok: false, error: `Weight should be between ${BODY_WEIGHT_LB_MIN} and ${BODY_WEIGHT_LB_MAX} lb.` };
    }
    return { ok: false, error: `Weight should be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.` };
  }

  // Fetch timezone if not provided
  let tz = timezone;
  if (!tz) {
    const { data: profile } = await client
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .single();
    tz = resolveTimezoneWithProfile(profile?.timezone);
  }

  const localDate = localDateString(tz);
  const { error } = await client.from("body_metrics").upsert(
    {
      user_id: userId,
      recorded_on: localDate,
      weight_kg: weightKg,
    },
    { onConflict: "user_id,recorded_on" }
  );

  if (error) {
    // Map check constraint error to friendly unit-aware message
    if (error.code === "23514" || error.message?.includes("body_metrics_weight_sane")) {
      if (units === "imperial") {
        return { ok: false, error: `Weight should be between ${BODY_WEIGHT_LB_MIN} and ${BODY_WEIGHT_LB_MAX} lb.` };
      }
      return { ok: false, error: `Weight should be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.` };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
