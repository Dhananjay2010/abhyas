"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { createBlockForUser } from "@/lib/program/persist";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { addDays, localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

export type BuildPlanResult = { ok: true } | { ok: false; error: string };

/**
 * Build (or rebuild) the user's current block.
 *
 * Needed both for users who finished onboarding before block generation
 * existed, and whenever goal, level, equipment or injuries change.
 *
 * `mode: "rebuild"` because every caller of this is a user saying "my answers
 * changed, re-plan what I am doing" -- not "I have finished four weeks". It
 * keeps the block number and the start date; see `createBlockForUser`. When
 * there is no block yet (the "Build my first block" path) it builds block 1.
 */
export async function buildPlan(): Promise<BuildPlanResult> {
  const rateLimit = await checkActionRateLimit("expensive");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const result = await createBlockForUser(supabase, user.id, { mode: "rebuild" });
  if (!result.ok) return { ok: false, error: result.error };

  revalidateTrainingData();
  return { ok: true };
}

/**
 * Shift a brand-new plan's anchor by one day ("Or start tomorrow").
 * 
 * Makes tomorrow day 1 by updating the program's started_on and ends_on dates.
 * Only allowed for a brand-new plan (block 1) before its first session is started.
 * Idempotent: two clicks shift only one day.
 */
export async function startTomorrow(): Promise<{ ok: true } | { ok: false; error: string }> {
  const rateLimit = await checkActionRateLimit("expensive");
  if (rateLimit) return rateLimit;

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile not found" };

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);
  const tomorrow = addDays(today, 1);

  // Get active program
  const { data: program } = await supabase
    .from("programs")
    .select("id, block_number, started_on, ends_on")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!program) {
    return { ok: false, error: "No active program" };
  }

  // Only allowed for brand-new plans (block 1)
  if (program.block_number !== 1) {
    return { ok: false, error: "Only allowed for new plans" };
  }

  // Check if any session has been started
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["in_progress", "completed"])
    .limit(1);

  if (sessions && sessions.length > 0) {
    return { ok: false, error: "Plan already started" };
  }

  // Idempotent: check if already shifted (tomorrow is the anchor)
  if (program.started_on === tomorrow) {
    return { ok: true };
  }

  // Shift the anchor by one day
  const { error } = await supabase
    .from("programs")
    .update({
      started_on: tomorrow,
      ends_on: addDays(program.ends_on, 1),
    })
    .eq("id", program.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateTrainingData();
  return { ok: true };
}
