"use server";

import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import type { Database } from "@/lib/database.types";
import { ownsPlannedWorkout } from "@/lib/progress/training-days";
import { rankAlternatives } from "@/lib/program/alternatives";
import { getSwapPatterns } from "@/lib/program/swap-patterns";
import { buildSwapContext } from "@/lib/program/swap-context";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { resolveAuth } from "@/lib/session/auth-result";
import { isEligible, score, hashString, buildInjuryFlags, type CandidateExercise } from "@/lib/program/generate";
import { ageOn } from "@/lib/onboarding/options";
import {
  describePersonalBest,
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
} from "@/lib/program/progression";
import { applyDeload, prescribe } from "@/lib/program/prescription";
import { cycleWeekFor } from "@/lib/program/block-range";
import { validateSet } from "@/lib/session/validation";
import { abandonSessionCore } from "@/lib/session/abandon-session";
import { startSessionCore } from "@/lib/session/start-session-core";
import { updateSessionCore } from "@/lib/session/update-session-core";
import { pickReusableSession } from "@/lib/session/reusable-session";
import { isoWeekday, localDateString } from "@/lib/dates";
import { logSetCore } from "@/lib/session/log-set-core";
import { writeExerciseProgressCore } from "@/lib/session/write-progress";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { buildLogSetValidationDeps, validateSessionForLogSet } from "@/lib/session/log-set-validation";
import { loadStartProgram, createSupabaseDeps as createLoadStartProgramDeps } from "@/lib/session/load-start-program";
import { loadPlanDay, createSupabaseDeps as createLoadPlanDayDeps } from "@/lib/session/load-plan-day";
import { resolveSwapPrefill } from "@/lib/session/swap-prefill";
import { resolveSwapWeights } from "@/lib/session/resolve-swap-weights";
import { ensureSessionExercises } from "@/lib/session/ensure-session-exercises";
import { progressForPlanningMode } from "@/lib/session/swap-progress";

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
 * The metric to stamp on a session exercise, from an embedded `exercises` row.
 *
 * PostgREST types a to-one embed as either an object or an array depending on
 * how it infers the relationship, and the shape is not worth arguing with at
 * four call sites. `reps` is the safe default: it is the column default too,
 * and it is what every exercise was before `metric` existed.
 */
function metricOf(embedded: unknown): Database["public"]["Enums"]["exercise_metric"] {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const m = (row as { metric?: string } | null | undefined)?.metric;
  return m === "seconds" ? "seconds" : "reps";
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

  // ---- wave 1 -------------------------------------------------------------
  // This action used to run seven round trips one after another, and it is the
  // one the user waits on with their finger still on the button: the elapsed
  // timer starts when the session row is inserted, so every second spent here
  // is a second already gone by the time the runner appears on screen.
  //
  // Two of those dependencies were only apparent. The open-session lookup was
  // filtered by today's local date, which needs the timezone from the profile;
  // it now fetches open sessions regardless of date and matches the date in
  // code, of which there is at most a handful. And the day lookup needed the
  // active program's id, so the program is fetched with all seven of its days
  // embedded and the right one is picked once the timezone is known.
  const [profileRes, openRes, settingsRes] = await Promise.all([
    supabase.from("profiles").select("timezone, primary_track").eq("id", user.id).single(),
    supabase
      .from("sessions")
      // `skipped` is in here so that an attempt ended early can be picked up
      // again -- see the reuse logic below.
      .select("id, status, local_date, actual_type, started_at")
      .in("status", ["planned", "in_progress", "skipped"])
      .order("local_date", { ascending: false })
      // Newest first within a date, so that where an account carries more than
      // one abandoned row for today -- which only pre-fix data can -- the most
      // recent attempt is the one resumed, rather than whichever row the
      // database happened to hand back first.
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_settings").select("resume_session").eq("user_id", user.id).maybeSingle(),
  ]);

  const timezone = resolveTimezoneWithProfile(profileRes.data?.timezone);
  const today = localDateString(timezone);
  const resumeEnabled = settingsRes.data?.resume_session ?? true;

  const todayRows = (openRes.data ?? []).filter((s) => s.local_date === today);
  const existing = pickReusableSession(todayRows, resumeEnabled);

  if (existing) {
    // A session row can exist with no exercises attached -- an abandoned first
    // attempt, or a row created by a yoga or breathing session earlier today.
    // Returning it as-is used to strand the user on "this session has no
    // exercises" with no way forward, permanently, because this branch would
    // keep returning the same empty shell.
    /*
      This is the update path. The session exists with status 'skipped' or
      status 'completed' and started_at: null (unstarted). The user pressed
      "Start" from the Today page.

      Stamped on a first start, and again when a deliberately abandoned
      session is restarted. The session clock is wall time since
      `started_at`, so carrying the old stamp across a quit at 7am and a
      restart at 1pm would record a six-hour workout. Resuming an
      `in_progress` session keeps its stamp, because that is the
      phone-locked-mid-set case the clock is meant to survive.
    */
    const updatePayload = {
      status: "in_progress" as const,
      ...(existing.started_at === null || existing.status === "skipped"
        ? { started_at: new Date().toISOString() }
        : {}),
    };

    const [updateResult] = await Promise.all([
      updateSessionCore(supabase, existing.id, user.id, today, updatePayload),
      ensureSessionExercises(supabase, user.id, existing.id),
    ]);

    if (!updateResult.ok) {
      return { ok: false, error: updateResult.error };
    }

    return { ok: true, data: { sessionId: updateResult.sessionId } };
  }

  // Ensure we have a current block before creating a session (fixes E-5: stale tab bug)
  const rolloverResult = await ensureCurrentBlock(supabase, user.id, today);
  if (rolloverResult.status === "none") {
    return { ok: false, error: "You have no active training block." };
  }
  if (rolloverResult.status === "error") {
    return { ok: false, error: rolloverResult.error };
  }

  // From the local date already computed above, not a second read of the clock:
  // deriving them separately let the weekday and the date disagree across a
  // midnight boundary.
  const dayIndex = isoWeekday(today);

  const loadResult = await loadStartProgram(
    createLoadStartProgramDeps(supabase),
    rolloverResult.programId,
    dayIndex
  );
  if (!loadResult.ok) return { ok: false, error: loadResult.error };

  const { program, day } = loadResult;

  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, today);
  const isDeloadWeek = week === program.deload_week;

  // ---- wave 2 -------------------------------------------------------------
  // Case C: Idempotent session start - check for existing in_progress session first
  const { data: existingInProgressSessions } = await supabase
    .from("sessions")
    .select("id, status, local_date, actual_type")
    .eq("user_id", user.id)
    .eq("local_date", today)
    .eq("status", "in_progress");

  if (existingInProgressSessions && existingInProgressSessions.length > 0) {
    // An in_progress session already exists for this user + date, return it (idempotent)
    return { ok: true, data: { sessionId: existingInProgressSessions[0].id } };
  }

  // No existing in_progress session, create a new one and read the plan
  const [insertResult, plannedRes] = await Promise.all([
    startSessionCore(supabase, user.id, {
      user_id: user.id,
      program_id: program.id,
      program_day_id: day.id,
      local_date: today,
      week_in_block: week,
      is_deload: isDeloadWeek,
      planned_type: day.day_type,
      actual_type: day.day_type,
      status: "in_progress",
      started_at: new Date().toISOString(),
    }),
    supabase
      .from("program_day_exercises")
      // The exercise's metric comes along so the session can record the unit it
      // was run in -- see `session_exercises.metric` and SPEC section 7.
      .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric)")
      .eq("program_day_id", day.id)
      .order("order_index"),
  ]);

  if (!insertResult.ok) {
    if ("existingSessionId" in insertResult && insertResult.existingSessionId) {
      return { ok: true, data: { sessionId: insertResult.existingSessionId } };
    }
    return { ok: false, error: insertResult.error };
  }

  const planned = plannedRes.data;
  if (planned && planned.length > 0) {
    const { error } = await supabase.from("session_exercises").insert(
      planned.map((p) => {
        // Week 4 of a block cuts volume; the weight suggestion is reduced
        // separately when the session is rendered.
        const dose = isDeloadWeek
          ? applyDeload({
              sets: p.target_sets,
              repsMin: p.target_reps_min,
              repsMax: p.target_reps_max,
              restSeconds: p.rest_seconds,
            })
          : {
              sets: p.target_sets,
              repsMin: p.target_reps_min,
              repsMax: p.target_reps_max,
              restSeconds: p.rest_seconds,
            };
        return {
          session_id: insertResult.sessionId,
          user_id: user.id, // corrected by the definer trigger
          exercise_id: p.exercise_id,
          order_index: p.order_index,
          planned_sets: dose.sets,
          planned_reps_min: dose.repsMin,
          planned_reps_max: dose.repsMax,
          rest_seconds: dose.restSeconds,
          metric: metricOf(p.exercises),
        };
      }),
    );
    if (error) return { ok: false, error: error.message };
  }

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
  return { ok: true, data: { sessionId: insertResult.sessionId } };
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
  
  const durationSeconds = input.durationSeconds ?? null;
  const invalid = validateSet(input.reps, input.weightKg, durationSeconds);
  if (invalid) return { ok: false, error: invalid };

  return await resolveAuth(
    async () => {
      const { supabase, user } = await getAuthedClient();
      return { user, supabase };
    },
    async ({ user, supabase }) => {
      if (!user) throw new Error("Not signed in");
      
      // Reject writes to sessions that are no longer in_progress or don't exist
      // For ended sessions, allow idempotent retry if the exact set already exists
      const validationDeps = buildLogSetValidationDeps(supabase);
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

export type { ProgressionFeedback };

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

  return finishExerciseCore(supabase, user.id, input, { applyProgression });
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

  const meta: ExerciseMeta = {
    mechanic: ex.mechanic,
    movementPattern: ex.movement_pattern,
    // The session's own unit, not the catalogue's. Scoring a finished session
    // by what the exercise has since been re-tagged as would read a set of
    // twelve reps as a twelve-second hold.
    metric: se.metric ?? "reps",
    isBodyweight: (ex.equipment_ids ?? []).length === 0,
    progressionChain: ex.progression_chain,
    progressionRank: ex.progression_rank,
  };

  const prior = progressRes.data;
  const state: ProgressState = {
    currentWorkingWeightKg: prior?.current_working_weight_kg === null || prior === null
      ? null
      : Number(prior.current_working_weight_kg),
    currentTargetReps: prior?.current_target_reps ?? null,
    consecutiveFailures: prior?.consecutive_failures ?? 0,
    bestWeightKg: prior?.best_weight_kg === null || prior === null ? null : Number(prior.best_weight_kg),
    bestReps: prior?.best_reps ?? null,
    bestE1rm: prior?.best_e1rm === null || prior === null ? null : Number(prior.best_e1rm),
    totalSessions: prior?.total_sessions ?? 0,
  };

  const decision = evaluateProgression({
    sets: (setsRes.data ?? []).map((s) => ({
      reps: s.reps,
      weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
      durationSeconds: s.duration_seconds,
    })),
    plannedSets: se.planned_sets ?? 3,
    repsMin: se.planned_reps_min ?? 8,
    repsMax: se.planned_reps_max ?? 12,
    feel,
    meta,
    state,
    isDeload: sessionRes.data?.is_deload ?? false,
  });

  await writeExerciseProgressCore(
    supabase,
    userId,
    se.exercise_id,
    decision,
    state.totalSessions,
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
}): Promise<Result> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit;
  
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

  // Deliberately NOT revalidating here. Revalidating refreshes the session
  // route, whose "completed -> redirect to /today" guard then fires before the
  // client can show the summary, so the user never saw their totals or what
  // progression changed. Today is refreshed when they leave the summary.
  return { ok: true };
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
  const result = await abandonSessionCore(supabase, sessionId, elapsedSeconds);
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
    ...buildInjuryFlags(injuriesRes.data ?? []),
    catalogue: [] as CandidateExercise[],
  };

  /*
    Ranked, not simply the first six rows the database happened to return.

    This used to `.slice(0, 6)` an unordered query, so the same handful came
    back every time — and because that order is effectively the order the
    catalogue was seeded in, it was alphabetical: a core slot with 57 eligible
    exercises offered the same six names beginning with A and B, and nothing
    else in the catalogue was reachable from the swap list at all.

    Ranking by the generator's own `score`, with the mechanic of the exercise
    being replaced, means a swap offers what the planner itself would have
    considered for that slot: a compound for a compound, and the simplest setup
    that does the job.

    Ties are broken by a hash of the slug against this session exercise rather
    than alphabetically. Scores bunch up hard — every equipment-free isolation
    core movement scores identically — so an alphabetical tie-break just moved
    the same problem one step along: the list became the first six A-to-C names
    instead of the first six overall, and a plank was still unreachable. The
    hash keeps the list stable for a given exercise, so it does not reshuffle
    under the user between taps, while different slots surface different work.
  */
  const wantCompound = replacing?.mechanic !== "isolation";
  const tieBreak = (slug: string) => hashString(`${sessionExerciseId}:${slug}`);
  
  // Build pattern list (current + fallbacks + knee-safe if applicable)
  const patterns = getSwapPatterns(pattern, input);
  
  // Helper to cast Supabase rows to typed pool rows
  type PoolRow = CandidateExercise & { cue: string | null };
  function asPoolRows(rows: unknown[] | null): PoolRow[] {
    return (rows ?? []) as unknown as PoolRow[];
  }
  
  // Query pool with widened pattern list
  const poolRes = await supabase
    .from("exercises")
    .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds")
    .in("movement_pattern", patterns)
    .eq("is_active", true);
  
  const pool = asPoolRows(poolRes.data);
  
  // Filter by isEligible first (generator safety rules: age, BMI, spinal load, etc.)
  const eligible = pool
    .filter((e) => !alreadyInSession.has(e.id))
    .filter((e) => isEligible(e, { ...input, catalogue: [] }));
  
  // Find current exercise in the pool (not in eligible - it may be contraindicated)
  let currentExercise = pool.find((e) => e.id === current.exercise_id);
  
  // If current is inactive or missing, fetch it separately
  if (!currentExercise) {
    const inactiveRes = await supabase
      .from("exercises")
      .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds")
      .eq("id", current.exercise_id)
      .maybeSingle();
    
    currentExercise = asPoolRows(inactiveRes.data ? [inactiveRes.data] : [])[0];
    if (!currentExercise) {
      return { ok: false, error: "Current exercise not found" };
    }
  }
  
  const scoreFn = (e: CandidateExercise) => score(e, wantCompound, input.level, input.primaryTrack);
  const swapContext = buildSwapContext(input, scoreFn, tieBreak);
  
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    swapContext,
  );

  const alternatives = ranked.map((e) => ({
    exerciseId: e.id,
    name: e.name,
    cue: e.cue ?? null,
    metric: e.metric ?? ("reps" as const),
  }));

  return { ok: true, data: alternatives };
}

/** What the runner needs to redraw the exercise after a swap. */
export type SwapResult = {
  metric: Database["public"]["Enums"]["exercise_metric"];
  repsMin: number | null;
  repsMax: number | null;
  equipmentIds: string[];
  weightPrefill: number | null;
  workingWeightKg: number | null;
  currentTargetReps: number | null;
  isBodyweight: boolean;
};

export async function swapExercise(input: {
  sessionExerciseId: string;
  newExerciseId: string;
}): Promise<Result<SwapResult>> {
  const rateLimit = await checkActionRateLimit("session");
  if (rateLimit) return rateLimit as Result<SwapResult>;
  
  const { supabase, user } = await requireUser();

  const [currentRes, replacementRes, profileRes, settingsRes] = await Promise.all([
    supabase
      .from("session_exercises")
      .select("exercise_id, metric, planned_reps_min, planned_reps_max, session_id")
      .eq("id", input.sessionExerciseId)
      .maybeSingle(),
    /*
      The unit can change with the swap: the alternatives for a core slot
      include holds, deliberately -- making a plank reachable from the swap list
      was the point of ranking that list. Without carrying the metric the
      session went on asking for reps while the screen named a plank.
      
      equipment_ids is also needed: when the session loads, isBodyweight is 
      derived from whether equipment_ids is empty, and without it here a barbell
      exercise swapped in would show "Added weight (kg)" instead of "Weight (kg)".
      
      movement_pattern is needed for swap prefill via suggestedWeight.
    */
    supabase
      .from("exercises")
      .select("metric, mechanic, equipment_ids, movement_pattern")
      .eq("id", input.newExerciseId)
      .maybeSingle(),
    supabase.from("profiles").select("goal, level").eq("id", user.id).single(),
    supabase.from("user_settings").select("planning_mode").eq("user_id", user.id).single(),
  ]);

  const current = currentRes.data;
  if (!current) return { ok: false, error: "Exercise not found" };

  const replacement = replacementRes.data;
  const metric = metricOf(replacement);
  const equipmentIds = replacement?.equipment_ids ?? [];
  const profile = profileRes.data;

  // Resolve weight prefill and working weight for the swapped-in exercise
  const { weightPrefill, workingWeightKg, currentTargetReps, isBodyweight } = await resolveSwapWeights(
    supabase,
    user.id,
    current.session_id,
    input.newExerciseId,
    equipmentIds,
    metric,
    replacementRes.data?.movement_pattern ?? "other",
  );

  // Filter target reps for daily_menu users (they don't remember weights/targets)
  const filteredProgress = progressForPlanningMode(
    settingsRes.data?.planning_mode,
    { current_target_reps: currentTargetReps, current_working_weight_kg: workingWeightKg }
  );
  const filteredTargetReps = filteredProgress?.current_target_reps ?? null;

  /*
    A changed unit needs a changed range. `planned_reps_min/max` are the range
    in the exercise's own metric, so swapping eight-to-twelve reps for a hold
    without re-prescribing would ask for an eight-second plank. The goal's hold
    table is the same one the generator uses, so a swap lands on what the
    planner would have prescribed for that slot.

    Only the range is re-derived. Sets stay as the day dosed them -- including a
    deload week's reduction, which `applyDeload` applies to sets and not to the
    range -- because the swap is a substitution within the session, not a
    re-planning of it.
  */
  const reranged =
    metric !== current.metric && profile?.goal && profile?.level
      ? prescribe(
          profile.goal,
          profile.level,
          replacementRes.data?.mechanic === "isolation",
          metric,
        )
      : null;

  const repsMin = reranged ? reranged.repsMin : current.planned_reps_min;
  const repsMax = reranged ? reranged.repsMax : current.planned_reps_max;

  const { error } = await supabase
    .from("session_exercises")
    .update({
      exercise_id: input.newExerciseId,
      swapped_from_exercise_id: current.exercise_id,
      metric,
      planned_reps_min: repsMin,
      planned_reps_max: repsMax,
    })
    .eq("id", input.sessionExerciseId);

  // Returned rather than left for the client to guess: the runner is mid-session
  // and must not re-fetch, but it does have to redraw the target and the
  // hold button with the range that was just written.
  return error
    ? { ok: false, error: error.message }
    : { ok: true, data: { metric, repsMin, repsMax, equipmentIds, weightPrefill, workingWeightKg, currentTargetReps: filteredTargetReps, isBodyweight } };
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

const OVERRIDE_TYPE: Record<
  Exclude<DayPlan["kind"], "keep" | "training">,
  Database["public"]["Enums"]["day_type"]
> = {
  rest: "rest",
  yoga: "yoga",
  breathing: "meditation",
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    return { ok: false, error: "That is not a date." };
  }
  if (input.localDate < today) {
    return { ok: false, error: "That day has already been and gone." };
  }

  // Anything already under way or finished is not ours to rewrite -- but only
  // the day's WORKOUT owns the day. Yoga and breathing are offered on every
  // screen as "anytime" activities, so a six-minute breathing session in the
  // morning must not make the day unplannable. Today already judges its own
  // state per training type for exactly this reason; this used to say "that day
  // is already done" to anyone who had breathed.
  const { data: existing } = await supabase
    .from("sessions")
    .select("id, status, actual_type")
    .eq("local_date", input.localDate);

  const settled = (existing ?? []).find(
    (s) =>
      ownsPlannedWorkout(s.actual_type) &&
      (s.status === "completed" || s.status === "in_progress"),
  );
  if (settled) {
    return {
      ok: false,
      error:
        settled.status === "completed"
          ? "That day is already done."
          : "That session has already started.",
    };
  }

  const planned = (existing ?? []).filter((s) => s.status === "planned");

  if (input.plan.kind === "keep") {
    if (planned.length > 0) {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .in(
          "id",
          planned.map((s) => s.id),
        );
      if (error) return { ok: false, error: error.message };
    }
    revalidateTrainingData();
    return { ok: true };
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id, started_on, deload_week, week_offset")
    .eq("status", "active")
    .maybeSingle();

  let actualType: Database["public"]["Enums"]["day_type"];
  let programDayId: string | null = null;

  if (input.plan.kind === "training") {
    const dayResult = await loadPlanDay(
      createLoadPlanDayDeps(supabase),
      input.plan.programDayId
    );
    if (!dayResult.ok) return { ok: false, error: dayResult.error };
    actualType = dayResult.day.day_type;
    programDayId = dayResult.day.id;
  } else {
    actualType = OVERRIDE_TYPE[input.plan.kind];
  }

  // Stamped now rather than left null. `startSession` fills these in only on
  // the path that creates a session itself; resuming a planned row keeps
  // whatever it was written with, and a null week would have shown "Week 1" on
  // an override day and silently skipped the deload.
  const week = program ? cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, input.localDate) : null;

  const row = {
    user_id: user.id,
    program_id: program?.id ?? null,
    program_day_id: programDayId,
    local_date: input.localDate,
    week_in_block: week,
    is_deload: week !== null && week === program?.deload_week,
    planned_type: actualType,
    actual_type: actualType,
    status: "planned" as const,
  };

  // One planned row per day: replace whatever was there rather than stacking
  // overrides, which is how the four duplicate "Skipped" rows in History
  // happened elsewhere.
  if (planned.length > 0) {
    const [first, ...rest] = planned;
    if (rest.length > 0) {
      await supabase
        .from("sessions")
        .delete()
        .in(
          "id",
          rest.map((s) => s.id),
        );
    }
    const { error } = await supabase.from("sessions").update(row).eq("id", first.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("sessions").insert(row);
    if (error) return { ok: false, error: error.message };
  }

  revalidateTrainingData();
  return { ok: true };
}
