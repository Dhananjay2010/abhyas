/**
 * Testable logic for buildPlan action (extracted for MED-2(b) wiring test).
 * Separated from actions.ts 'use server' context to enable behavioral testing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { localDateString } from "@/lib/dates";
import { buildRebuildPlanDeps } from "./rebuild-plan-deps";
import { rebuildPlanCore } from "./rebuild-plan-core";

export type BuildPlanLogicResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Core buildPlan logic: compute today from profile timezone, run rebuildPlanCore.
 * This is the logic tested by MED-2(b) wiring test.
 */
export async function buildPlanLogic(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<BuildPlanLogicResult> {
  // Get user's timezone to compute today
  const profileRes = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  
  if (profileRes.error || !profileRes.data) {
    return { ok: false, error: "Failed to load profile" };
  }
  
  const timezone = resolveTimezoneWithProfile(profileRes.data.timezone);
  const today = localDateString(timezone);

  const deps = buildRebuildPlanDeps(supabase, userId, today);
  
  try {
    const result = await rebuildPlanCore(deps);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "An error occurred during rebuild" 
    };
  }
}
