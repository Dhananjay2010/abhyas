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

export type BodyWeightDbOps = {
  getUnits(): Promise<"metric" | "imperial">;
  getTimezone(): Promise<string | null>;
  upsertBodyMetric(recordedOn: string, weightKg: number): Promise<{ error: { code?: string; message: string } | null }>;
};

export function createBodyWeightDbOps(client: SupabaseClient, userId: string): BodyWeightDbOps {
  return {
    async getUnits() {
      return getProfileUnits(client, userId);
    },
    async getTimezone() {
      const { data: profile } = await client
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .single();
      return profile?.timezone ?? null;
    },
    async upsertBodyMetric(recordedOn: string, weightKg: number) {
      const { error } = await client.from("body_metrics").upsert(
        {
          user_id: userId,
          recorded_on: recordedOn,
          weight_kg: weightKg,
        },
        { onConflict: "user_id,recorded_on" }
      );
      return { error };
    },
  };
}

export async function logBodyWeightCore(
  db: BodyWeightDbOps,
  weightKg: number,
  timezone?: string
): Promise<LogBodyWeightResult> {
  if (!Number.isFinite(weightKg)) {
    return { ok: false, error: "Invalid weight value." };
  }

  const units = await db.getUnits();
  
  if (!validateBodyWeightKg(weightKg, units)) {
    if (units === "imperial") {
      return { ok: false, error: `Weight should be between ${BODY_WEIGHT_LB_MIN} and ${BODY_WEIGHT_LB_MAX} lb.` };
    }
    return { ok: false, error: `Weight should be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.` };
  }

  let tz = timezone;
  if (!tz) {
    const profileTz = await db.getTimezone();
    tz = resolveTimezoneWithProfile(profileTz);
  }

  const localDate = localDateString(tz);
  const { error } = await db.upsertBodyMetric(localDate, weightKg);

  if (error) {
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
