"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { MIN_AGE_YEARS, ageOn } from "@/lib/onboarding/options";
import { localDateString } from "@/lib/dates";
import { createBlockForUser } from "@/lib/program/persist";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

export async function acceptDisclaimer(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ disclaimer_accepted_at: new Date().toISOString() })
    .eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveAboutYou(input: {
  dateOfBirth: string;
  sex: Database["public"]["Enums"]["sex_type"];
  heightCm: number;
  weightKg: number;
}): Promise<ActionResult> {
  const age = ageOn(input.dateOfBirth);
  if (Number.isNaN(age)) return { ok: false, error: "That date does not look right." };
  if (age < MIN_AGE_YEARS)
    return { ok: false, error: `You need to be at least ${MIN_AGE_YEARS} to use Abhyas.` };
  if (age > 100) return { ok: false, error: "Please check your date of birth." };
  if (input.heightCm < 100 || input.heightCm > 250)
    return { ok: false, error: "Height should be between 100 and 250 cm." };
  if (input.weightKg < 25 || input.weightKg > 300)
    return { ok: false, error: "Weight should be between 25 and 300 kg." };

  const { supabase, user } = await requireUser();

  const { data: tzRow } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      date_of_birth: input.dateOfBirth,
      sex: input.sex,
      height_cm: input.heightCm,
    })
    .eq("id", user.id);
  if (profileError) return { ok: false, error: profileError.message };

  // The first weigh-in doubles as the BMI input for the safety filters. It is
  // dated in the user's timezone, not UTC.
  const today = localDateString(tzRow?.timezone || "Asia/Kolkata");
  const { error: weightError } = await supabase
    .from("body_metrics")
    .upsert(
      { user_id: user.id, recorded_on: today, weight_kg: input.weightKg },
      { onConflict: "user_id,recorded_on" },
    );
  if (weightError) return { ok: false, error: weightError.message };

  return { ok: true };
}

export async function saveProfileFields(fields: ProfileUpdate): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveEquipment(input: {
  hasAll: boolean;
  equipmentIds: string[];
}): Promise<ActionResult> {
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

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
