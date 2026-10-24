"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";
import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { MAX_DAYS } from "@/lib/breathing/journey";
import { parsePhases } from "@/lib/breathing/pattern";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import {
  isMood,
  validatePatternDraft,
  validatePractice,
  validatePrefs,
  MAX_CUSTOM_PATTERNS,
  type PatternDraft,
  type PracticeInput,
  type PrefsPatch,
} from "@/lib/breathing/validation";

export type Result = { ok: true } | { ok: false; error: string };
export type DataResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Record a finished (or deliberately ended) practice.
 *
 * All the writing happens in `record_breathing_practice`, one database
 * function, so the session row and its breathing log land together or not at
 * all. It also carries the fix for B1: it never reuses a session that is not a
 * planned breathing slot, so an unfinished workout is left alone.
 * See supabase/migrations/20260912090000_breathe_phase_one.sql.
 *
 * Returns the session it wrote into. A routine's first step passes no session
 * and keeps this id; its later steps pass it back, so the whole routine is one
 * session with a log per step.
 */
export async function recordBreathingPractice(
  input: PracticeInput,
): Promise<DataResult<{ sessionId: string }>> {
  const invalid = validatePractice(input);
  if (invalid) return { ok: false, error: invalid };

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit as DataResult<{ sessionId: string }>;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const today = localDateString(profile?.timezone || "Asia/Kolkata");

  const { data, error } = await supabase.rpc("record_breathing_practice", {
    p_log_id: input.logId,
    p_local_date: today,
    // Nullable in SQL, but the type generator marks every argument non-null.
    p_pattern_id: input.patternId as string,
    p_user_pattern_id: input.userPatternId as string,
    p_cycles: input.cycles,
    p_planned_cycles: input.plannedCycles,
    p_breaths: input.breaths,
    p_seconds: input.seconds,
    p_ended_early: input.endedEarly,
    // The type generator marks every function argument as non-null. This one
    // is nullable in SQL, and null is how "no check-in" is recorded.
    p_mood_before: input.moodBefore as number,
    p_guidance: input.guidance,
    p_session_id: (input.sessionId ?? null) as string,
    p_routine_id: (input.routineId ?? null) as string,
    p_routine_step: (input.routineStep ?? null) as number,
  });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That practice was not saved." };

  revalidatePath("/breathe", "layout");
  revalidateTrainingData();
  return { ok: true, data: { sessionId: data } };
}

export type JourneyDayResult = {
  daysCompleted: number;
  dayCount: number;
  /** False when the day was already counted, or is not the day that is open. */
  advanced: boolean;
};

/**
 * Count a day of a journey, against the practice that was just saved.
 *
 * The two rules that make this a course -- days in order, one a day -- live in
 * `advance_journey_day`, not here, because the progress table has no write
 * policy at all. Being refused is not an error: repeating a day is an ordinary
 * thing to do, so the function reports where you are either way.
 * See supabase/migrations/20260918090000_breathe_journey.sql.
 */
export async function recordJourneyDay(input: {
  journeyId: string;
  day: number;
  logId: string;
}): Promise<DataResult<JourneyDayResult>> {
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > MAX_DAYS) {
    return { ok: false, error: "That is not a day of this course." };
  }

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit as DataResult<JourneyDayResult>;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase.rpc("advance_journey_day", {
    p_journey_id: input.journeyId,
    p_day: input.day,
    // The day this counts towards is the user's own date, never the browser's.
    p_local_date: localDateString(profile?.timezone || "Asia/Kolkata"),
    p_log_id: input.logId,
  });
  if (error) return { ok: false, error: error.message };

  const row = data?.[0];
  if (!row) return { ok: false, error: "That day was not recorded." };

  revalidatePath("/breathe", "layout");
  return {
    ok: true,
    data: {
      daysCompleted: row.days_completed,
      dayCount: row.day_count,
      advanced: row.advanced,
    },
  };
}

/** The "how do you feel now?" answer, added to a practice that is already saved. */
export async function rateBreathingPractice(input: {
  logId: string;
  moodAfter: number;
}): Promise<Result> {
  if (!isMood(input.moodAfter)) return { ok: false, error: "That check-in is not valid." };

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
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

/**
 * Your own timings for one of our practices.
 *
 * One row per practice per person, so saving again replaces what was there.
 * `SPEC.md` section 9.4 asked for this from the start.
 */
export async function savePatternTiming(input: {
  basePatternId: string;
  draft: PatternDraft;
}): Promise<Result> {
  const invalid = validatePatternDraft(input.draft);
  if (invalid) return { ok: false, error: invalid };
  // The phases go into jsonb, so they are re-read by the same parser the
  // player uses before they are trusted.
  if (!parsePhases(input.draft.phases)) return { ok: false, error: "Those timings are not valid." };

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.from("user_breathing_patterns").upsert(
    {
      user_id: user.id,
      base_pattern_id: input.basePatternId,
      name: input.draft.name.trim(),
      phases: input.draft.phases,
    },
    { onConflict: "user_id,base_pattern_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true };
}

/** Back to the timings we ship. */
export async function resetPatternTiming(basePatternId: string): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("user_breathing_patterns")
    .delete()
    .eq("base_pattern_id", basePatternId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true };
}

/** A practice you made yourself. Returns its id, so the caller can open it. */
export async function saveCustomPattern(input: {
  id?: string;
  draft: PatternDraft;
}): Promise<DataResult<{ id: string }>> {
  const invalid = validatePatternDraft(input.draft);
  if (invalid) return { ok: false, error: invalid };
  if (!parsePhases(input.draft.phases)) return { ok: false, error: "That practice is not valid." };

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit as DataResult<{ id: string }>;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const row = { name: input.draft.name.trim(), phases: input.draft.phases };

  if (input.id) {
    const { data, error } = await supabase
      .from("user_breathing_patterns")
      .update(row)
      .eq("id", input.id)
      .is("base_pattern_id", null)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "That practice was not found." };
    revalidatePath("/breathe", "layout");
    return { ok: true, data: { id: data.id } };
  }

  const { count } = await supabase
    .from("user_breathing_patterns")
    .select("id", { count: "exact", head: true })
    .is("base_pattern_id", null);
  if ((count ?? 0) >= MAX_CUSTOM_PATTERNS) {
    return { ok: false, error: `You can keep ${MAX_CUSTOM_PATTERNS} of your own practices.` };
  }

  const { data, error } = await supabase
    .from("user_breathing_patterns")
    .insert({ user_id: user.id, base_pattern_id: null, ...row })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true, data: { id: data.id } };
}

/**
 * Delete a practice of yours. Its history survives: the log keeps the name it
 * was practised under, and the foreign key is cleared rather than cascading.
 */
export async function deleteCustomPattern(id: string): Promise<Result> {
  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("user_breathing_patterns")
    .delete()
    .eq("id", id)
    .is("base_pattern_id", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true };
}

type SettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

/** Breathing preferences. They save as they are touched, like the Settings screen. */
export async function updateBreathingPrefs(patch: PrefsPatch): Promise<Result> {
  const invalid = validatePrefs(patch);
  if (invalid) return { ok: false, error: invalid };

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;

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
  if (patch.kapalabhatiAck !== undefined) {
    update.breathing_kapalabhati_ack = patch.kapalabhatiAck;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  // Upsert for the same reason as updateSessionSettings: an UPDATE against a
  // missing user_settings row changes nothing and reports success, so every
  // Breathe preference would appear to save and then revert.
  const { error } = await supabase
    .from("user_settings")
    .upsert({ ...update, user_id: user.id }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/breathe", "layout");
  return { ok: true };
}
