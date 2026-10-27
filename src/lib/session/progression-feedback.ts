import { buildProgressionInput } from "./build-progression-input";
import { evaluateProgression, describePersonalBest } from "@/lib/program/progression";
import type { UnitsPreference } from "@/lib/units";
import { getProfileUnits } from "@/lib/get-profile-units";
import type { Database } from "@/lib/database.types";
import { writeExerciseProgressCore } from "./write-progress";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerClient = SupabaseClient<Database>;
type SetFeel = Database["public"]["Enums"]["set_feel"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];
type ProgressionFeedback = {
  outcome: string;
  message: string;
  personalBest: string | null;
};

/**
 * progressionFeedback: Build progression input, evaluate it, and describe any PB.
 * 
 * Extracted from actions.ts to enable unit testing the full units flow
 * without mock Supabase clients.
 */
export function progressionFeedback(
  se: Parameters<typeof buildProgressionInput>[0],
  sets: Parameters<typeof buildProgressionInput>[1],
  prior: Parameters<typeof buildProgressionInput>[2],
  session: Parameters<typeof buildProgressionInput>[3],
  feel: Parameters<typeof buildProgressionInput>[4],
  units: UnitsPreference,
) {
  const input = buildProgressionInput(se, sets, prior, session, feel, units);
  const decision = evaluateProgression(input);
  const personalBest = decision.personalBest 
    ? describePersonalBest(decision.personalBest, units)
    : null;
  return { input, decision, personalBest };
}

/**
 * Build progression feedback for a session exercise.
 * Not a server action — a pure helper called by finishExercise.
 * 
 * @returns null if no feedback (daily menu mode, no data with per-set logging off)
 */
export async function buildProgressionFeedbackForUser(
  supabase: ServerClient,
  userId: string,
  sessionExerciseId: string,
  feel: SetFeel | null,
): Promise<ProgressionFeedback | null> {
  const [settingsRes, units] = await Promise.all([
    supabase
      .from("user_settings")
      .select("planning_mode, per_set_logging")
      .eq("user_id", userId)
      .maybeSingle(),
    getProfileUnits(supabase, userId),
  ]);

  const settings = settingsRes.data;

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

  const { decision, personalBest } = progressionFeedback(
    se,
    setsRes.data ?? [],
    prior,
    sessionRes.data ?? { is_deload: null, local_date: null, program_id: null },
    feel,
    units,
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
    personalBest,
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
