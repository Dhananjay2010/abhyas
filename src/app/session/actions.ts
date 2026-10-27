"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import type { Database } from "@/lib/database.types";
import { getSwapPatterns } from "@/lib/program/swap-patterns";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import type { CandidateExercise } from "@/lib/program/generate";
import {
  describePersonalBest,
  evaluateProgression,
} from "@/lib/program/progression";
import { buildProgressionInput } from "@/lib/session/build-progression-input";
import { startSessionFullCore } from "@/lib/session/start-session-full-core";
import { buildStartSessionFullDeps } from "@/lib/session/start-session-full-deps";
import { planDayCore } from "@/lib/session/plan-day-core";
import { createPlanDayDbOps } from "@/lib/session/make-plan-day-client";
import { localDateString } from "@/lib/dates";
import { logSetCore } from "@/lib/session/log-set-core";
import { writeExerciseProgressCore } from "@/lib/session/write-progress";
import { buildLogSetValidationDeps, validateSessionForLogSet } from "@/lib/session/log-set-validation";
import { finishSessionAction, abandonSessionAction } from "@/lib/session/session-action-wrappers";
import { swapExerciseForUser, type SwapResult } from "@/lib/session/swap-exercise-for-user";
import { canSwapExercise, createSupabaseSwapGuardDeps } from "@/lib/session/swap-guard";
import { buildEligibleSwapList, buildGeneratorInput } from "@/lib/session/eligible-swap-list";

export type { SwapResult };

import { loadSessionSummary } from "@/lib/session/load-session-summary";
import type { SummaryNote } from "@/lib/session/load-session-summary";

type SetFeel = Database["public"]["Enums"]["set_feel"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; code?: string };

export type SetConflictResult = {
  ok: false;
  reason: "set_exists";
  savedSets: Array<{
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }>;
};

async function requireUser() {
  const { supabase, user } = await getAuthedClient();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/**
 * Start (or resume) today's session.
 *
 * Resuming matters: people lock their phone mid-workout. If a session for today
 * already exists and is not finished, we return it untouched rather than
 * wiping the sets already logged.
 */
export async function startSession(): Promise<Result<{ sessionId: string }>> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<{ sessionId: string }>;
  
  const { supabase, user } = await requireUser();

  const result = await startSessionFullCore(buildStartSessionFullDeps(supabase, user.id, Date.now()));
  if (!result.ok) return { ok: false, error: result.error };

  // Deliberately NOT revalidating. This action is invoked from a button on
  // Today, and revalidating a path re-renders it — so `revalidatePath("/today")`
  // here made Next render the whole Today screen again, five more queries, as
  // part of this action's response, while the user stood waiting to start a
  // workout they are about to navigate away from. It was pure cost on the one
  // path where latency is felt most.
  //
  // Nothing goes stale as a result. The session's own screen is fetched fresh
  // by the navigation that follows; Today is refreshed by
  // `refreshAfterSession()` when the user comes back, and by `abandonSession`
  // if they quit. The worst case is that returning to Today within the client
  // cache's window shows "Start session" instead of "Resume session" — and
  // pressing it finds this very session and resumes it.
  return { ok: true, data: { sessionId: result.sessionId } };
}

export async function markWarmupDone(sessionId: string): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;
  
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
  /** Seconds held, for a `seconds` exercise. Its `reps` stays null. */
  durationSeconds?: number | null;
}): Promise<Result | SetConflictResult> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();
  
  const { checkLogSetInput } = await import("@/lib/session/check-log-set-input");
  const invalid = await checkLogSetInput(supabase, user.id, {
    reps: input.reps,
    weightKg: input.weightKg,
    durationSeconds: input.durationSeconds,
  });
  if (invalid) return { ok: false, error: invalid };

  // Reject writes to sessions that are no longer in_progress or don't exist
  // For ended sessions, allow idempotent retry if the exact set already exists
  const validationDeps = buildLogSetValidationDeps(supabase);
  const durationSeconds = input.durationSeconds ?? null;
  const validationResult = await validateSessionForLogSet(
    validationDeps, 
    input.sessionExerciseId,
    {
      setNumber: input.setNumber,
      reps: input.reps,
      weightKg: input.weightKg,
      durationSeconds,
    }
  );
  
  if (!validationResult.ok) {
    return validationResult;
  }

  return logSetCore(supabase, user.id, {
    sessionExerciseId: input.sessionExerciseId,
    setNumber: input.setNumber,
    reps: input.reps,
    weightKg: input.weightKg,
    durationSeconds,
  });
}

export async function deleteSet(
  sessionExerciseId: string,
  setNumber: number,
): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;
  
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("is_warmup_set", false);
  return error ? { ok: false, error: error.message } : { ok: true };
}

import { finishExerciseCore, type ProgressionFeedback } from "@/lib/session/finish-exercise";
import { makeFinishExerciseDeps } from "@/lib/session/finish-exercise-deps";

export type { ProgressionFeedback, SummaryNote };

/**
 * Complete an exercise and apply progression from what was actually logged.
 *
 * Progression runs here rather than at the end of the session so that a
 * workout cut short still banks the exercises that were finished.
 *
 * Idempotent: only the first call that actually transitions from pending to
 * completed/skipped applies progression. Concurrent or repeated calls return
 * success without double-applying.
 */
export async function finishExercise(input: {
  sessionExerciseId: string;
  feel: SetFeel | null;
  skipped?: boolean;
}): Promise<Result<ProgressionFeedback | null>> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<ProgressionFeedback | null>;
  
  const { supabase, user } = await requireUser();
  const deps = makeFinishExerciseDeps(supabase, applyProgression);

  return finishExerciseCore(deps, user.id, input);
}

type ServerClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function applyProgression(
  supabase: ServerClient,
  userId: string,
  sessionExerciseId: string,
  feel: SetFeel | null,
): Promise<ProgressionFeedback | null> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("planning_mode, per_set_logging")
    .eq("user_id", userId)
    .maybeSingle();

  // Daily-menu mode keeps no working-weight memory. History is preserved, so
  // switching back to progression resumes from where it left off.
  if (settings?.planning_mode === "daily_menu") return null;

  const { data: se } = await supabase
    .from("session_exercises")
    .select("id, session_id, exercise_id, planned_sets, planned_reps_min, planned_reps_max, metric, exercises!session_exercises_exercise_id_fkey(mechanic, movement_pattern, equipment_ids, progression_chain, progression_rank)")
    .eq("id", sessionExerciseId)
    .maybeSingle();
  if (!se) return null;

  const ex = se.exercises as unknown as {
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    movement_pattern: MovementPattern;
    equipment_ids: string[];
    progression_chain: string | null;
    progression_rank: number | null;
  };
  if (!ex) return null;

  const [sessionRes, setsRes, progressRes] = await Promise.all([
    supabase.from("sessions").select("is_deload, local_date, program_id").eq("id", se.session_id).maybeSingle(),
    supabase
      .from("session_sets")
      .select("reps, weight_kg, duration_seconds")
      .eq("session_exercise_id", sessionExerciseId)
      .eq("is_warmup_set", false)
      .order("set_number"),
    supabase
      .from("exercise_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("exercise_id", se.exercise_id)
      .maybeSingle(),
  ]);

  const prior = progressRes.data;
  const totalSessions = prior?.total_sessions ?? 0;

  const decision = evaluateProgression(
    buildProgressionInput(
      se,
      setsRes.data ?? [],
      prior,
      sessionRes.data ?? { is_deload: null, local_date: null, program_id: null },
      feel
    )
  );

  await writeExerciseProgressCore(
    supabase,
    userId,
    se.exercise_id,
    decision,
    totalSessions,
    sessionRes.data?.local_date ?? null,
  );

  // Outgrew a bodyweight variation: upgrade the plan so next time is harder.
  if (decision.wantsHarderVariation && ex.progression_chain) {
    await upgradeVariation(supabase, userId, se.exercise_id, ex.progression_chain, ex.progression_rank ?? 0);
  }

  /*
    Nothing to say when the user has chosen not to give us numbers.

    With per-set logging off, a set is recorded with `reps`, `weight_kg` and
    `duration_seconds` all null -- that is the whole point of the mode, and
    `validateSet` allows it. `evaluateProgression` then has no working sets and
    returns `no_data`, so every exercise of every session would raise a banner
    reading "No reps recorded, so nothing changed": nagging someone about a
    setting they chose on purpose, three or five times a workout.

    The progress row above is still written. "You did this today" is worth
    recording whether or not it came with numbers, and it is what makes
    switching back to per-set logging resume from the right place.
  */
  if (settings?.per_set_logging === false && decision.outcome === "no_data") return null;

  return {
    outcome: decision.outcome,
    message: decision.message,
    personalBest: decision.personalBest
      ? describePersonalBest(decision.personalBest)
      : null,
  };
}

/** Swap the exercise in the active program for the next link in its chain. */
async function upgradeVariation(
  supabase: ServerClient,
  userId: string,
  currentExerciseId: string,
  chain: string,
  rank: number,
) {
  const { data: next } = await supabase
    .from("exercises")
    .select("id")
    .eq("progression_chain", chain)
    .gt("progression_rank", rank)
    .eq("is_active", true)
    .order("progression_rank")
    .limit(1)
    .maybeSingle();
  if (!next) return;

  await supabase
    .from("program_day_exercises")
    .update({ exercise_id: next.id })
    .eq("user_id", userId)
    .eq("exercise_id", currentExerciseId);
}

export async function finishSession(input: {
  sessionId: string;
  durationSeconds: number;
  cooldownCompleted: boolean;
}): Promise<Result<{ status: "completed" | "skipped"; durationSeconds: number | null }>> {
  const rateLimit = await checkActionRateLimit<{ status: "completed" | "skipped"; durationSeconds: number | null }>("session");
  if (rateLimit) return rateLimit;
  
  const { supabase } = await requireUser();

  // Deliberately NOT revalidating here. Revalidating refreshes the session
  // route, whose "completed -> redirect to /today" guard then fires before the
  // client can show the summary, so the user never saw their totals or what
  // progression changed. Today is refreshed when they leave the summary.
  return await finishSessionAction(supabase, input);
}

/**
 * End a session early.
 *
 * If the user logged at least one working set, the session counts as completed
 * (g2 fix). Only a session with no working sets at all is marked skipped.
 * Warm-up sets don't count as training.
 *
 * Safety note: Completed sessions are NOT resumable (startSession only resumes
 * planned/in_progress/skipped). This is intentional - a session with working sets
 * logged counts toward streak/days trained and shows in History as completed, not
 * skipped. The tradeoff: user cannot resume after early end if they had sets.
 * Alternative would be a new status like "partial" that's resumable but counts.
 */
export async function abandonSession(
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;

  const { supabase } = await requireUser();
  const result = await abandonSessionAction(supabase, sessionId, elapsedSeconds);
  if (result.ok) revalidateTrainingData();
  return result;
}

/**
 * Refresh the screens a finished session changed.
 *
 * `finishSession` deliberately revalidates nothing, because any revalidation
 * inside a Server Action re-renders the route the user is on — here the
 * session route, whose "completed -> redirect to /today" guard would fire and
 * snatch away the summary before it could be read. This is the same work,
 * moved to the moment the user leaves the summary, when a re-render resolving
 * to /today is exactly where they asked to go.
 */
export async function refreshAfterSession(): Promise<Result> {
  revalidateTrainingData();
  return { ok: true };
}

/**
 * Load the "What changed for next time" summary from the database.
 *
 * FIX (a): The summary was built from client state (progressNotes), which was
 * lost when the user navigated away and resumed. This rebuilds it from
 * session_exercises, session_sets, and exercise_progress.
 */
export async function getSessionSummary(sessionId: string): Promise<Result<SummaryNote[]>> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<SummaryNote[]>;

  const { supabase, user } = await requireUser();

  try {
    const summary = await loadSessionSummary(supabase, sessionId, user.id);
    return { ok: true, data: summary };
  } catch (error) {
    console.error("Failed to load session summary:", error);
    return { ok: false, error: "Could not load session summary" };
  }
}

export type Alternative = {
  exerciseId: string;
  name: string;
  cue: string | null;
  /** So the runner can switch to a hold when the swap is one. */
  metric: Database["public"]["Enums"]["exercise_metric"];
};

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
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<Alternative[]>;
  
  const { supabase, user } = await requireUser();

  const { data: current } = await supabase
    .from("session_exercises")
    .select("session_id, exercise_id, exercises!session_exercises_exercise_id_fkey(movement_pattern, mechanic)")
    .eq("id", sessionExerciseId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Exercise not found" };

  const replacing = current.exercises as unknown as {
    movement_pattern: MovementPattern;
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
  } | null;
  const pattern = replacing?.movement_pattern;
  if (!pattern) return { ok: false, error: "This exercise has no movement pattern" };

  const [profileRes, weightRes, equipmentRes, injuriesRes, siblingsRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("body_metrics").select("weight_kg")
        .order("recorded_on", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase.from("session_exercises").select("exercise_id").eq("session_id", current.session_id),
    ]);

  const profile = profileRes.data;
  if (!profile) return { ok: false, error: "Profile not found" };

  const weightKg = weightRes.data?.weight_kg ?? null;

  const alreadyInSession = new Set(
    (siblingsRes.data ?? []).map((s) => s.exercise_id),
  );
  
  // Build GeneratorInput using shared helper
  const generatorInput = buildGeneratorInput({
    userId: user.id,
    profile: {
      goal: profile.goal!,
      level: profile.level!,
      primary_track: profile.primary_track!,
      days_per_week: profile.days_per_week ?? 3,
      yoga_days_per_week: profile.yoga_days_per_week ?? 0,
      date_of_birth: profile.date_of_birth,
      height_cm: profile.height_cm,
      has_all_equipment: profile.has_all_equipment ?? false,
    },
    equipmentIds: (equipmentRes.data ?? []).map((r) => r.equipment_id),
    injuries: injuriesRes.data ?? [],
    weightKg: weightKg ? Number(weightKg) : null,
  });

  // Build pattern list (current + fallbacks + knee-safe if applicable)
  const patterns = getSwapPatterns(pattern, generatorInput);
  
  // Helper to cast Supabase rows to typed pool rows
  type PoolRow = CandidateExercise & { cue: string | null };
  function asPoolRows(rows: unknown[] | null): PoolRow[] {
    return (rows ?? []) as unknown as PoolRow[];
  }
  
  // Query pool with widened pattern list
  const poolRes = await supabase
    .from("exercises")
    .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category")
    .in("movement_pattern", patterns)
    .eq("is_active", true);
  
  const pool = asPoolRows(poolRes.data);
  
  // Find current exercise in the pool
  let currentExercise = pool.find((e) => e.id === current.exercise_id);
  
  // If current is inactive or missing, fetch it separately
  if (!currentExercise) {
    const inactiveRes = await supabase
      .from("exercises")
      .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category")
      .eq("id", current.exercise_id)
      .maybeSingle();
    
    currentExercise = asPoolRows(inactiveRes.data ? [inactiveRes.data] : [])[0];
    if (!currentExercise) {
      return { ok: false, error: "Current exercise not found" };
    }
  }
  
  // Use single source of truth for swap list
  const ranked = buildEligibleSwapList({
    currentExercise,
    sessionExerciseId,
    generatorInput,
    pool,
    alreadyInSession,
  });

  const alternatives = ranked.map((e) => {
    const poolRow = pool.find(p => p.id === e.id);
    return {
      exerciseId: e.id,
      name: e.name,
      cue: poolRow?.cue ?? null,
      metric: e.metric ?? ("reps" as const),
    };
  });

  return { ok: true, data: alternatives };
}

export async function swapExercise(input: {
  sessionExerciseId: string;
  newExerciseId: string;
}): Promise<Result<SwapResult>> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<SwapResult>;
  
  const { supabase, user } = await requireUser();

  const guardResult = await canSwapExercise(
    createSupabaseSwapGuardDeps(supabase),
    input.sessionExerciseId,
  );
  if (!guardResult.allowed) {
    return { ok: false, error: guardResult.error };
  }

  return swapExerciseForUser(supabase, user.id, input);
}

// ---------------------------------------------------------------------------
// "What about tomorrow?"
//
// SPEC.md section 7 asks for this at the end of every session, and again on
// Today when a day was missed: keep the plan, swap the day, or rest. It is
// what stops the block feeling like something the app imposes.
//
// A choice is a ONE-DAY OVERRIDE, stored as a planned `sessions` row for that
// date. Nothing about the block moves: the dates, the deload week and the
// week-in-block arithmetic are all untouched, and a workout declined is simply
// not done. Today prefers the override when one exists for the day it renders.
// ---------------------------------------------------------------------------

/** The choices the prompt can offer, resolved on the server into a session row. */
export type DayPlan =
  | { kind: "keep" }
  | { kind: "rest" }
  | { kind: "yoga" }
  | { kind: "breathing" }
  | { kind: "training"; programDayId: string };

/** A day the user can move to, as offered by the prompt. */
export type PlannableDay = {
  programDayId: string;
  label: string;
  dayType: Database["public"]["Enums"]["day_type"];
};

/**
 * Plan one day.
 *
 * Refuses to touch a day that has already been trained or started, so this can
 * never rewrite history or pull the plan out from under a session in progress.
 * "Keep" removes any override rather than writing one, which is what makes the
 * prompt safe to change your mind with.
 */
export async function planDay(input: {
  localDate: string;
  plan: DayPlan;
}): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  const today = localDateString(timezone);

  const client = createPlanDayDbOps(supabase, user.id);

  const result = await planDayCore(client, {
    userId: user.id,
    localDate: input.localDate,
    today,
    plan: input.plan,
  });

  if (result.ok) {
    revalidateTrainingData();
  }

  return result;
}
