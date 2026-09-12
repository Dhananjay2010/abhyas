"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";
import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import {
  isMood,
  validatePractice,
  validatePrefs,
  type PracticeInput,
  type PrefsPatch,
} from "@/lib/breathing/validation";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Record a finished (or deliberately ended) practice.
 *
 * All the writing happens in `record_breathing_practice`, one database
 * function, so the session row and its breathing log land together or not at
 * all. It also carries the fix for B1: it never reuses a session that is not a
 * planned breathing slot, so an unfinished workout is left alone.
 * See supabase/migrations/20260912090000_breathe_phase_one.sql.
 */
export async function recordBreathingPractice(input: PracticeInput): Promise<Result> {
  const invalid = validatePractice(input);
  if (invalid) return { ok: false, error: invalid };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const today = localDateString(profile?.timezone || "Asia/Kolkata");

  const { error } = await supabase.rpc("record_breathing_practice", {
    p_log_id: input.logId,
    p_local_date: today,
    p_pattern_id: input.patternId,
    p_cycles: input.cycles,
    p_planned_cycles: input.plannedCycles,
    p_breaths: input.breaths,
    p_seconds: input.seconds,
    p_ended_early: input.endedEarly,
    // The type generator marks every function argument as non-null. This one
    // is nullable in SQL, and null is how "no check-in" is recorded.
    p_mood_before: input.moodBefore as number,
    p_guidance: input.guidance,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  revalidateTrainingData();
  return { ok: true };
}

/** The "how do you feel now?" answer, added to a practice that is already saved. */
export async function rateBreathingPractice(input: {
  logId: string;
  moodAfter: number;
}): Promise<Result> {
  if (!isMood(input.moodAfter)) return { ok: false, error: "That check-in is not valid." };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS limits this to the caller's own logs. A zero-row result means the id
  // is not theirs or does not exist, and that is reported rather than
  // pretending the answer was saved.
  const { data, error } = await supabase
    .from("breathing_logs")
    .update({ mood_after: input.moodAfter })
    .eq("id", input.logId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "That practice was not found." };

  revalidatePath("/breathe", "layout");
  revalidatePath("/history", "layout");
  return { ok: true };
}

type SettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

/** Breathing preferences. They save as they are touched, like the Settings screen. */
export async function updateBreathingPrefs(patch: PrefsPatch): Promise<Result> {
  const invalid = validatePrefs(patch);
  if (invalid) return { ok: false, error: invalid };

  const update: SettingsUpdate = {};
  if (patch.defaultMinutes !== undefined) update.meditation_default_minutes = patch.defaultMinutes;
  if (patch.guidance !== undefined) update.breathing_guidance = patch.guidance;
  if (patch.ambience !== undefined) update.breathing_ambience = patch.ambience;
  if (patch.ambienceVolume !== undefined) update.breathing_ambience_volume = patch.ambienceVolume;
  if (patch.voiceLang !== undefined) update.breathing_voice_lang = patch.voiceLang;
  if (patch.showCount !== undefined) update.breathing_show_count = patch.showCount;
  if (patch.vibrate !== undefined) update.breathing_vibrate = patch.vibrate;
  if (patch.settleIn !== undefined) update.breathing_settle_in = patch.settleIn;
  if (patch.checkIn !== undefined) update.breathing_check_in = patch.checkIn;
  if (Object.keys(update).length === 0) return { ok: true };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.from("user_settings").update(update).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true };
}
