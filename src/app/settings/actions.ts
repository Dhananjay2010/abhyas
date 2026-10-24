"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import type { Database } from "@/lib/database.types";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { validateAndUpdateProfile } from "./profile-update-logic";
import { decideEquipmentUpdate } from "./equipment-logic";
import { resetProgressionTargets } from "@/lib/program/progression";

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
 */
export async function updateProfileSettings(patch: ProfileUpdate): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  if (patch.days_per_week != null && (patch.days_per_week < 3 || patch.days_per_week > 6)) {
    return { ok: false, error: "Days per week must be between 3 and 6." };
  }
  if (
    patch.yoga_days_per_week != null &&
    patch.days_per_week != null &&
    patch.yoga_days_per_week > patch.days_per_week - 1
  ) {
    return { ok: false, error: "At least one day a week has to be training." };
  }

  // Reset progression targets if goal, level, days_per_week, or track changed
  const resetsProgression =
    patch.goal !== undefined ||
    patch.level !== undefined ||
    patch.days_per_week !== undefined ||
    patch.track !== undefined;

  if (resetsProgression) {
    await resetProgressionTargets(supabase, user.id);
  }

  // Validate and update with testable logic
  const result = await validateAndUpdateProfile(patch, {
    updateProfile: async (validatedPatch) => {
      const { error } = await supabase.from("profiles").update(validatedPatch).eq("id", user.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!result.ok) return result;

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

  // Fetch current state
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_all_equipment")
    .eq("id", user.id)
    .single();
  
  const { data: currentEquipment } = await supabase
    .from("user_equipment")
    .select("equipment_id")
    .eq("user_id", user.id);
  
  const currentHasAll = profile?.has_all_equipment ?? false;
  const currentEquipmentIds = currentEquipment?.map(e => e.equipment_id) ?? [];
  
  // Decide what to do
  const decision = decideEquipmentUpdate({
    currentHasAll,
    currentEquipmentIds,
    newHasAll: input.hasAll,
    newEquipmentIds: input.equipmentIds,
  });
  
  if (decision.action === "error") {
    return { ok: false, error: decision.error };
  }
  
  if (decision.action === "skip") {
    return { ok: true };
  }

  // Write changes
  const { error: flagError } = await supabase
    .from("profiles")
    .update({ has_all_equipment: input.hasAll })
    .eq("id", user.id);
  if (flagError) return { ok: false, error: flagError.message };

  if (!input.hasAll) {
    const { error: clearError } = await supabase
      .from("user_equipment")
      .delete()
      .eq("user_id", user.id);
    if (clearError) return { ok: false, error: clearError.message };

    if (input.equipmentIds.length > 0) {
      const { error } = await supabase
        .from("user_equipment")
        .insert(input.equipmentIds.map((id) => ({ user_id: user.id, equipment_id: id })));
      if (error) return { ok: false, error: error.message };
    }
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
