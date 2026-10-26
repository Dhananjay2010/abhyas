"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { createBlockForUser } from "@/lib/program/persist";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { resolveDay } from "@/lib/program/day-plan";
import { planDay } from "@/app/session/actions";

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
 * Makes tomorrow day 1 and today rest by planning rest for today.
 * Only allowed for a brand-new plan (block 1) before its first session is started.
 * Idempotent: if today is already rest, does nothing.
 */
export async function startTomorrow(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile not found" };

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);

  // Get active program
  const { data: program } = await supabase
    .from("programs")
    .select("id, block_number, started_on")
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

  // Check if today is already rest (idempotent)
  const resolved = await resolveDay(supabase, program.id, today);
  if (!resolved || resolved.dayType === "rest") {
    // Already rest, nothing to do
    return { ok: true };
  }

  // Plan rest for today (makes tomorrow day 1)
  const result = await planDay({
    localDate: today,
    plan: { kind: "rest" },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateTrainingData();
  return { ok: true };
}
