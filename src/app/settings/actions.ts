"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import type { Database } from "@/lib/database.types";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { validateSettingsFields } from "@/lib/profile/validation";

type SettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

export type Result = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const { supabase, user } = await getAuthedClient();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/** Session preferences. None of these affect the generated plan. */
export async function updateSessionSettings(patch: SettingsUpdate): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();
  // Upsert, not update. `user_settings` is created by the on_auth_user_created
  // trigger, so a plain UPDATE quietly matches zero rows for any account whose
  // row is missing — and PostgREST reports no error for that, so the action
  // returned ok, the toggle moved on screen, and the change was gone on the
  // next load. The row's own column defaults fill anything the patch omits.
  const { error } = await supabase
    .from("user_settings")
    .upsert({ ...patch, user_id: user.id }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Profile fields. Goal, level, days per week and track all change what the
 * generator would produce, so the caller is told the plan is now stale rather
 * than the block being silently rebuilt underneath them.
 *
 * M5 fix: Allow-list columns to prevent mass assignment.
 */
export async function updateProfileSettings(patch: ProfileUpdate): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;

  const validation = validateSettingsFields(patch);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(validation.data).eq("id", user.id);
  if (error) {
    console.error("updateProfileSettings update failed:", error);
    return { ok: false, error: "Couldn't save your settings. Please try again." };
  }
  revalidatePath("/settings");
  revalidatePath("/today");
  return { ok: true };
}

export async function updateEquipment(input: {
  hasAll: boolean;
  equipmentIds: string[];
}): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  const { error: flagError } = await supabase
    .from("profiles")
    .update({ has_all_equipment: input.hasAll })
    .eq("id", user.id);
  if (flagError) return { ok: false, error: flagError.message };

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

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateInjuries(
  injuries: { bodyRegion: BodyRegion; severity: InjurySeverity }[],
): Promise<Result> {
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
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
