"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import type { Database } from "@/lib/database.types";
import { localDateString } from "@/lib/dates";
import { createBlockForUser } from "@/lib/program/persist";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import {
  validateOnboardingFields,
  validateDateOfBirth,
  validateHeightCm,
  validateWeightKg,
} from "@/lib/profile/validation";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const { supabase, user } = await getAuthedClient();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/**
 * M5 fix: Call SECURITY DEFINER RPC that sets timestamp server-side.
 */
export async function acceptDisclaimer(): Promise<ActionResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;

  const { supabase } = await requireUser();
  // @ts-expect-error - RPC exists in migration but types not yet generated
  const { error } = await supabase.rpc("accept_disclaimer");
  if (error) {
    console.error("acceptDisclaimer RPC failed:", error);
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
  return { ok: true };
}

export async function saveAboutYou(input: {
  dateOfBirth: string;
  sex: Database["public"]["Enums"]["sex_type"];
  heightCm: number;
  weightKg: number;
}): Promise<ActionResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;

  const { supabase, user } = await requireUser();

  // Fetch timezone first for age validation
  const { data: tzRow } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  
  const timezone = tzRow?.timezone || "Asia/Kolkata";

  // L6 fix: validate age in the user's timezone, not UTC
  const dobValidation = validateDateOfBirth(input.dateOfBirth, timezone);
  if (!dobValidation.ok) return { ok: false, error: dobValidation.error };

  // P3-M5: check for NaN and Infinity
  const heightValidation = validateHeightCm(input.heightCm);
  if (!heightValidation.ok) return heightValidation;

  const weightValidation = validateWeightKg(input.weightKg);
  if (!weightValidation.ok) return weightValidation;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      date_of_birth: dobValidation.date,
      sex: input.sex,
      height_cm: input.heightCm,
    })
    .eq("id", user.id);
  if (profileError) {
    console.error("saveAboutYou profile update failed:", profileError);
    // The validation trigger enforces age >= 16; surface that message
    if (profileError.message?.includes("16 years old")) {
      return { ok: false, error: profileError.message };
    }
    return { ok: false, error: "Couldn't save your information. Please try again." };
  }

  // The first weigh-in doubles as the BMI input for the safety filters. It is
  // dated in the user's timezone, not UTC.
  const today = localDateString(timezone);
  const { error: weightError } = await supabase
    .from("body_metrics")
    .upsert(
      { user_id: user.id, recorded_on: today, weight_kg: input.weightKg },
      { onConflict: "user_id,recorded_on" },
    );
  if (weightError) return { ok: false, error: weightError.message };

  return { ok: true };
}

/**
 * M5 fix: Allow-list columns and validate values.
 * Used by onboarding to set goal, level, track, days_per_week, etc.
 */
export async function saveProfileFields(fields: ProfileUpdate): Promise<ActionResult> {
<<<<<<< HEAD
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
=======
  const validation = validateOnboardingFields(fields);
  if (!validation.ok) return { ok: false, error: validation.error };

>>>>>>> c3a8e82 (feat: harden profile data access and fix auth open redirect)
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(validation.data).eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveEquipment(input: {
  hasAll: boolean;
  equipmentIds: string[];
}): Promise<ActionResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  const { error: flagError } = await supabase
    .from("profiles")
    .update({ has_all_equipment: input.hasAll })
    .eq("id", user.id);
  if (flagError) return { ok: false, error: flagError.message };

  // Replace rather than merge: the checklist is the complete picture each time.
  const { error: clearError } = await supabase
    .from("user_equipment")
    .delete()
    .eq("user_id", user.id);
  if (clearError) return { ok: false, error: clearError.message };

  if (!input.hasAll && input.equipmentIds.length > 0) {
    const { error } = await supabase
      .from("user_equipment")
      .insert(input.equipmentIds.map((id) => ({ user_id: user.id, equipment_id: id })));
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function saveInjuries(
  injuries: { bodyRegion: BodyRegion; severity: InjurySeverity; note?: string }[],
): Promise<ActionResult> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  const { error: clearError } = await supabase
    .from("user_injuries")
    .delete()
    .eq("user_id", user.id);
  if (clearError) return { ok: false, error: clearError.message };

  if (injuries.length > 0) {
    const { error } = await supabase.from("user_injuries").insert(
      injuries.map((i) => ({
        user_id: user.id,
        body_region: i.bodyRegion,
        severity: i.severity,
        note: i.note || null,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function completeOnboarding(): Promise<ActionResult> {
  const rateLimit = await checkActionRateLimit("expensive");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  // Guard against a client that skipped ahead: everything the engine needs must exist.
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select(
      "date_of_birth, sex, height_cm, goal, level, primary_track, days_per_week, disclaimer_accepted_at",
    )
    .eq("id", user.id)
    .single();
  if (readError) return { ok: false, error: readError.message };

  const missing = Object.entries({
    "the disclaimer": profile.disclaimer_accepted_at,
    "your date of birth": profile.date_of_birth,
    "your height": profile.height_cm,
    "your goal": profile.goal,
    "your level": profile.level,
    "where you train": profile.primary_track,
    "days per week": profile.days_per_week,
  })
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);

  if (missing.length > 0)
    return { ok: false, error: `Still missing: ${missing.join(", ")}.` };

  // Build the first block before marking onboarding done, so a user never lands
  // on Today with a completed profile and no plan.
  const block = await createBlockForUser(supabase, user.id);
  if (!block.ok) return { ok: false, error: block.error };

  /**
   * M5 fix: Call SECURITY DEFINER RPC that sets timestamp server-side
   * and checks prerequisites (disclaimer, DOB, height, goal, level, track, days).
   */
  // @ts-expect-error - RPC exists in migration but types not yet generated
  const { error } = await supabase.rpc("complete_onboarding");
  if (error) return { ok: false, error: error.message };

  revalidateTrainingData();
  return { ok: true };
}
