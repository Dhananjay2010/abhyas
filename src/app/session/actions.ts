"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { ageOn } from "@/lib/onboarding/options";
import { isEligible, type CandidateExercise } from "@/lib/program/generate";

type SetFeel = Database["public"]["Enums"]["set_feel"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/** The user's local calendar date, which is how sessions are keyed. */
function localDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/**
 * Start (or resume) today's session.
 *
 * Resuming matters: people lock their phone mid-workout. If a session for today
 * already exists and is not finished, we return it untouched rather than
 * wiping the sets already logged.
 */
export async function startSession(): Promise<Result<{ sessionId: string }>> {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, primary_track")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone || "Asia/Kolkata";
  const today = localDate(timezone);

  const { data: existing } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("local_date", today)
    .in("status", ["planned", "in_progress"])
    .maybeSingle();

  if (existing) {
    await supabase
      .from("sessions")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", existing.id)
      .is("started_at", null);
    return { ok: true, data: { sessionId: existing.id } };
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id, started_on, deload_week")
    .eq("status", "active")
    .maybeSingle();
  if (!program) return { ok: false, error: "You have no active training block." };

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
  }).format(new Date());
  const dayIndex =
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(
      weekday,
    ) + 1;

  const { data: day } = await supabase
    .from("program_days")
    .select("id, day_type, focus, label")
    .eq("program_id", program.id)
    .eq("day_index", dayIndex || 1)
    .maybeSingle();
  if (!day) return { ok: false, error: "No plan for today." };

  const daysIn = Math.floor(
    (new Date(today).getTime() - new Date(`${program.started_on}T00:00:00`).getTime()) /
      86400000,
  );
  const week = Math.min(4, Math.max(1, Math.floor(daysIn / 7) + 1));

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      program_id: program.id,
      program_day_id: day.id,
      local_date: today,
      week_in_block: week,
      is_deload: week === program.deload_week,
      planned_type: day.day_type,
      actual_type: day.day_type,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { ok: false, error: sessionError?.message ?? "Could not start the session" };
  }

  const { data: planned } = await supabase
    .from("program_day_exercises")
    .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds")
    .eq("program_day_id", day.id)
    .order("order_index");

  if (planned && planned.length > 0) {
    const { error } = await supabase.from("session_exercises").insert(
      planned.map((p) => ({
        session_id: session.id,
        user_id: user.id, // corrected by the definer trigger
        exercise_id: p.exercise_id,
        order_index: p.order_index,
        planned_sets: p.target_sets,
        planned_reps_min: p.target_reps_min,
        planned_reps_max: p.target_reps_max,
        rest_seconds: p.rest_seconds,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/today");
  return { ok: true, data: { sessionId: session.id } };
}

export async function markWarmupDone(sessionId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("sessions")
    .update({ warmup_completed: true })
    .eq("id", sessionId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function logSet(input: {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
}): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("session_sets").upsert(
    {
      session_exercise_id: input.sessionExerciseId,
      user_id: user.id,
      set_number: input.setNumber,
      reps: input.reps,
      weight_kg: input.weightKg,
      is_warmup_set: false,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "session_exercise_id,set_number,is_warmup_set" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSet(
  sessionExerciseId: string,
  setNumber: number,
): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("is_warmup_set", false);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function finishExercise(input: {
  sessionExerciseId: string;
  feel: SetFeel | null;
  skipped?: boolean;
}): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("session_exercises")
    .update({
      status: input.skipped ? "skipped" : "completed",
      feel: input.feel,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.sessionExerciseId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function finishSession(input: {
  sessionId: string;
  durationSeconds: number;
  cooldownCompleted: boolean;
}): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_seconds: input.durationSeconds,
      cooldown_completed: input.cooldownCompleted,
    })
    .eq("id", input.sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}

export async function abandonSession(sessionId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "skipped" })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/today");
  return { ok: true };
}

export type Alternative = { exerciseId: string; name: string; cue: string | null };

/**
 * Alternatives for an exercise the user cannot do right now -- a busy machine,
 * or something that hurts today.
 *
 * Candidates are filtered through the generator's own `isEligible`, so a swap
 * can never route around the equipment, level, injury, BMI or age filters.
 */
export async function findAlternatives(
  sessionExerciseId: string,
): Promise<Result<Alternative[]>> {
  const { supabase, user } = await requireUser();

  const { data: current } = await supabase
    .from("session_exercises")
    .select("session_id, exercise_id, exercises(movement_pattern)")
    .eq("id", sessionExerciseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Exercise not found" };

  const pattern = (current.exercises as unknown as { movement_pattern: MovementPattern })
    ?.movement_pattern;
  if (!pattern) return { ok: false, error: "This exercise has no movement pattern" };

  const [profileRes, weightRes, equipmentRes, injuriesRes, siblingsRes, poolRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("body_metrics").select("weight_kg")
        .order("recorded_on", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase.from("session_exercises").select("exercise_id").eq("session_id", current.session_id),
      supabase
        .from("exercises")
        .select("id, slug, name, cue, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds")
        .eq("movement_pattern", pattern)
        .eq("is_active", true),
    ]);

  const profile = profileRes.data;
  if (!profile) return { ok: false, error: "Profile not found" };

  const weightKg = weightRes.data?.weight_kg ?? null;
  const bmi =
    weightKg && profile.height_cm
      ? Number(weightKg) / (Number(profile.height_cm) / 100) ** 2
      : null;

  const alreadyInSession = new Set(
    (siblingsRes.data ?? []).map((s) => s.exercise_id),
  );

  const input = {
    userId: user.id,
    blockNumber: 1,
    goal: profile.goal!,
    level: profile.level!,
    primaryTrack: profile.primary_track!,
    daysPerWeek: profile.days_per_week ?? 3,
    yogaDaysPerWeek: profile.yoga_days_per_week ?? 0,
    age: profile.date_of_birth ? ageOn(profile.date_of_birth) : null,
    bmi,
    hasAllEquipment: profile.has_all_equipment ?? false,
    equipmentIds: (equipmentRes.data ?? []).map((r) => r.equipment_id),
    currentInjuryRegions: (injuriesRes.data ?? [])
      .filter((i) => i.severity === "current")
      .map((i) => i.body_region),
    catalogue: [] as CandidateExercise[],
  };

  const alternatives = ((poolRes.data ?? []) as unknown as CandidateExercise[])
    .filter((e) => !alreadyInSession.has(e.id))
    .filter((e) => isEligible(e, { ...input, catalogue: [] }))
    .slice(0, 6)
    .map((e) => ({
      exerciseId: e.id,
      name: e.name,
      cue: (e as unknown as { cue: string | null }).cue ?? null,
    }));

  return { ok: true, data: alternatives };
}

export async function swapExercise(input: {
  sessionExerciseId: string;
  newExerciseId: string;
}): Promise<Result> {
  const { supabase } = await requireUser();

  const { data: current } = await supabase
    .from("session_exercises")
    .select("exercise_id")
    .eq("id", input.sessionExerciseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Exercise not found" };

  const { error } = await supabase
    .from("session_exercises")
    .update({
      exercise_id: input.newExerciseId,
      swapped_from_exercise_id: current.exercise_id,
    })
    .eq("id", input.sessionExerciseId);

  return error ? { ok: false, error: error.message } : { ok: true };
}
