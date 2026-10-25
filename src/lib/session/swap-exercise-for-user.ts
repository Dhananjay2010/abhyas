import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { swapExerciseCore } from "./swap-exercise-core";
import { resolveSwapWeights } from "./resolve-swap-weights";
import { remembersWeightsFor, resolveSwapResultPayload } from "./swap-progress";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type SwapResult = {
  metric: Database["public"]["Enums"]["metric"];
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
  const [currentRes, replacementRes, profileRes, settingsRes] = await Promise.all([
    supabase
      .from("session_exercises")
      .select("exercise_id, metric, planned_reps_min, planned_reps_max, session_id")
      .eq("id", input.sessionExerciseId)
      .maybeSingle(),
    supabase
      .from("exercises")
      .select("metric, mechanic, equipment_ids, movement_pattern")
      .eq("id", input.newExerciseId)
      .maybeSingle(),
    supabase.from("profiles").select("goal, level").eq("id", userId).single(),
    supabase.from("user_settings").select("planning_mode").eq("user_id", userId).single(),
  ]);

  const current = currentRes.data;
  if (!current) return { ok: false, error: "Exercise not found" };

  const replacement = replacementRes.data;
  const profile = profileRes.data;

  const remembersWeights = remembersWeightsFor(settingsRes.data?.planning_mode);

  const { metric, repsMin, repsMax, equipmentIds, weightPrefill, workingWeightKg, currentTargetReps, isBodyweight } = 
    await swapExerciseCore(
      {
        resolveSwapWeights: (sessionId, newExerciseId, equipmentIds, metric, movementPattern, remembersWeights) =>
          resolveSwapWeights(supabase, userId, sessionId, newExerciseId, equipmentIds, metric, movementPattern, remembersWeights),
      },
      {
        newExerciseId: input.newExerciseId,
        current,
        replacement,
        profile,
        remembersWeights,
      },
    );

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
