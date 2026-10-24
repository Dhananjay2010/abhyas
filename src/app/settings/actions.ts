"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import type { Database } from "@/lib/database.types";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { validateAndUpdateProfile } from "./profile-update-logic";
import { decideEquipmentUpdate } from "./equipment-logic";
import { isAllowedSessionLength, getSessionLengthErrorMessage } from "@/lib/onboarding/session-length";
import { ensureGenerationSnapshot } from "@/lib/program/ensure-generation-snapshot";

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
  if (patch.preferred_session_minutes != null) {
    if (!isAllowedSessionLength(patch.preferred_session_minutes)) {
      return { ok: false, error: getSessionLengthErrorMessage() };
    }
  }

  // Backfill generation_inputs if null (for existing users)
  await ensureGenerationSnapshot(supabase, user.id);

  // Validate and update with testable logic
  const result = await validateAndUpdateProfile(patch, {
    updateProfile: async (validatedPatch) => {
      const { error } = await supabase.from("profiles").update(validatedPatch).eq("id", user.id);
      if (error) {
        // Map database errors to friendly messages
        let message = error.message;
        if (message.includes("null value") && message.includes("preferred_session_minutes")) {
          message = "Session length is required.";
        } else if (message.includes("invalid input syntax for type integer")) {
          message = "Please enter valid numbers.";
        }
        return { ok: false, error: message };
      }
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
  
  // Backfill generation_inputs if null (for existing users)
  await ensureGenerationSnapshot(supabase, user.id);

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

  // L2 QA fix: Validate equipment IDs exist before writing anything
  if (!input.hasAll && input.equipmentIds.length > 0) {
    // Dedupe the IDs
    const uniqueIds = Array.from(new Set(input.equipmentIds));
    
    // Check all IDs exist in equipment catalogue
    const { data: validEquipment, error: catalogueError } = await supabase
      .from("equipment")
      .select("id")
      .in("id", uniqueIds);
    
    if (catalogueError) {
      return { ok: false, error: catalogueError.message };
    }
    
    const validIds = new Set(validEquipment?.map(e => e.id) ?? []);
    const invalidIds = uniqueIds.filter(id => !validIds.has(id));
    
    if (invalidIds.length > 0) {
      return { 
        ok: false, 
        error: `Invalid equipment: ${invalidIds.join(", ")}` 
      };
    }
  }

  // L2 QA fix: Insert/upsert new rows before deleting removed ones
  if (!input.hasAll && input.equipmentIds.length > 0) {
    const uniqueIds = Array.from(new Set(input.equipmentIds));
    
    // Upsert new equipment rows
    const { error: upsertError } = await supabase
      .from("user_equipment")
      .upsert(
        uniqueIds.map((id) => ({ user_id: user.id, equipment_id: id })),
        { onConflict: "user_id,equipment_id" }
      );
    if (upsertError) return { ok: false, error: upsertError.message };

    // Delete rows that were removed (not in new list)
    const toDelete = currentEquipmentIds.filter(id => !uniqueIds.includes(id));
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("user_equipment")
        .delete()
        .eq("user_id", user.id)
        .in("equipment_id", toDelete);
      if (deleteError) return { ok: false, error: deleteError.message };
    }
  } else if (!input.hasAll && input.equipmentIds.length === 0) {
    // Clear all equipment when switching to empty list
    const { error: clearError } = await supabase
      .from("user_equipment")
      .delete()
      .eq("user_id", user.id);
    if (clearError) return { ok: false, error: clearError.message };
  }

  // L2 QA fix: Update has_all flag AFTER row writes succeed
  const { error: flagError } = await supabase
    .from("profiles")
    .update({ has_all_equipment: input.hasAll })
    .eq("id", user.id);
  if (flagError) return { ok: false, error: flagError.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateInjuries(
  injuries: { bodyRegion: BodyRegion; severity: InjurySeverity }[],
): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();
  
  // Backfill generation_inputs if null (for existing users)
  await ensureGenerationSnapshot(supabase, user.id);

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
