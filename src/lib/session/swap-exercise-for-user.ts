import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "@/lib/program/generate";
import { swapExerciseCore } from "./swap-exercise-core";
import { resolveSwapWeights } from "./resolve-swap-weights";
import { remembersWeightsFor, resolveSwapResultPayload } from "./swap-progress";
import { buildEligibleSwapList, buildGeneratorInput } from "./eligible-swap-list";
import { getSwapPatterns } from "@/lib/program/swap-patterns";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

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

export async function swapExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    sessionExerciseId: string;
    newExerciseId: string;
  },
): Promise<Result<SwapResult>> {
  const [currentRes, replacementRes, profileRes, settingsRes, weightRes, injuryRes, equipmentRes] = await Promise.all([
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
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_settings").select("planning_mode").eq("user_id", userId).single(),
    supabase.from("body_metrics").select("weight_kg").eq("user_id", userId).order("recorded_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("user_injuries").select("body_region, severity").eq("user_id", userId),
    supabase.from("user_equipment").select("equipment_id").eq("user_id", userId),
  ]);

  const current = currentRes.data;
  if (!current) return { ok: false, error: "Exercise not found" };

  const replacement = replacementRes.data;
  const profile = profileRes.data;
  
  // Validator reads: fail closed if required data is unavailable
  if (!profile || !profile.goal || !profile.level || !profile.primary_track) {
    return { ok: false, error: "Profile not found or incomplete" };
  }
  if (injuryRes.error) return { ok: false, error: "Could not load injury data" };
  if (equipmentRes.error) return { ok: false, error: "Could not load equipment data" };

  // Build GeneratorInput for validator
  const weightKg = weightRes.data?.weight_kg ?? null;
  const generatorInput = buildGeneratorInput({
    userId,
    profile: {
      goal: profile.goal,
      level: profile.level,
      primary_track: profile.primary_track,
      days_per_week: profile.days_per_week ?? 3,
      yoga_days_per_week: profile.yoga_days_per_week ?? 0,
      date_of_birth: profile.date_of_birth,
      height_cm: profile.height_cm,
      has_all_equipment: profile.has_all_equipment ?? false,
    },
    equipmentIds: (equipmentRes.data ?? []).map(e => e.equipment_id),
    injuries: injuryRes.data ?? [],
    weightKg: weightKg ? Number(weightKg) : null,
  });

  // Get current exercise for validator
  const currentExerciseRes = await supabase
    .from("exercises")
    .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category")
    .eq("id", current.exercise_id)
    .maybeSingle();
  
  if (!currentExerciseRes.data) {
    return { ok: false, error: "Current exercise not found" };
  }
  
  const currentExercise: CandidateExercise = { ...currentExerciseRes.data, metric: "seconds" };
  
  // Build swap pattern list
  const patterns = getSwapPatterns(currentExercise.movement_pattern, generatorInput);
  
  // Get eligible pool
  const poolRes = await supabase
    .from("exercises")
    .select("id, slug, name, cue, metric, movement_pattern, mechanic, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category")
    .in("movement_pattern", patterns)
    .eq("is_active", true);
  
  if (poolRes.error) {
    return { ok: false, error: "Could not load exercise pool" };
  }
  
  const pool: CandidateExercise[] = poolRes.data ?? [];
  
  // Get exercises already in this session
  const siblingsRes = await supabase
    .from("session_exercises")
    .select("exercise_id")
    .eq("session_id", current.session_id);
  
  if (siblingsRes.error) {
    return { ok: false, error: "Could not load session exercises" };
  }
  
  const alreadyInSession = new Set(
    (siblingsRes.data ?? []).map((s) => s.exercise_id),
  );
  
  // Build eligible swap list (single source of truth)
  const ranked = buildEligibleSwapList({
    currentExercise,
    sessionExerciseId: input.sessionExerciseId,
    generatorInput,
    pool,
    alreadyInSession,
  });
  
  // Validator: accept iff target is in the eligible swap list
  const validateSwapTarget = async (validateInput: { newExerciseId: string; sessionExerciseId: string }) => {
    return ranked.some(e => e.id === validateInput.newExerciseId);
  };

  const remembersWeights = remembersWeightsFor(settingsRes.data?.planning_mode);

  const coreResult = await swapExerciseCore(
      {
        resolveSwapWeights: (sessionId, newExerciseId, equipmentIds, metric, movementPattern, remembersWeights) =>
          resolveSwapWeights(supabase, userId, sessionId, newExerciseId, equipmentIds, metric, movementPattern, remembersWeights),
        validateSwapTarget,
      },
      {
        newExerciseId: input.newExerciseId,
        sessionExerciseId: input.sessionExerciseId,
        current,
        replacement,
        profile,
        remembersWeights,
      },
    );
  
  if (!coreResult.ok) return coreResult;
  
  const { metric, repsMin, repsMax, equipmentIds, weightPrefill, workingWeightKg, currentTargetReps, isBodyweight } = coreResult;

  const swapPayload = resolveSwapResultPayload({
    planningMode: settingsRes.data?.planning_mode,
    rawCurrentTargetReps: currentTargetReps,
    rawWorkingWeightKg: workingWeightKg,
    planRepsMin: repsMin,
    planRepsMax: repsMax,
  });
  const filteredTargetReps = swapPayload.currentTargetReps;

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

  return error
    ? { ok: false, error: error.message }
    : { ok: true, data: { metric, repsMin, repsMax, equipmentIds, weightPrefill, workingWeightKg, currentTargetReps: filteredTargetReps, isBodyweight } };
}
