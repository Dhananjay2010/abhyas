"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { createBlockForUser } from "@/lib/program/persist";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { cleanBannedPlannedExercises } from "@/lib/program/clean-banned-planned";

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

export type CleanBannedResult = { ok: true; cleaned: number } | { ok: false; error: string };

/**
 * Clean banned exercises from planned workouts (on-demand persistence).
 * Called as a Server Action when user needs immediate cleanup.
 */
export async function cleanBannedExercises(): Promise<CleanBannedResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };
  
  const rateLimit = await checkActionRateLimit("expensive");
  if (rateLimit && !rateLimit.ok) return rateLimit;

  const result = await cleanBannedPlannedExercises(supabase, user.id);
  if (result.errors.length > 0) {
    return { ok: false, error: result.errors[0] };
  }

  revalidateTrainingData();
  return { ok: true, cleaned: result.cleaned };
}
