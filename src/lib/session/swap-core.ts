/**
 * Core swap logic extracted from server action
 * Takes dependencies as parameters for testing
 */

import { buildSwapResult } from "./swap-decision";
import { prescribe } from "../program/prescription";
import type { Database } from "../database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function swapExerciseCore(
  deps: {
    supabase: Pick<SupabaseClient<Database>, "from">;
    userId: string;
  },
  input: { sessionExerciseId: string; newExerciseId: string }
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      data: {
        metric: Database["public"]["Enums"]["exercise_metric"];
        repsMin: number | null;
        repsMax: number | null;
        equipmentIds: string[];
        workingWeightKg: number | null;
        suggestedWeightKg: number | null;
        targetReps: number | null;
      };
    }
> {
  const { supabase, userId } = deps;

  const [currentRes, replacementRes, profileRes, sessionRes, settingsRes] = await Promise.all([
    supabase
      .from("session_exercises")
      .select("id, exercise_id, metric, planned_reps_min, planned_reps_max, status")
      .eq("id", input.sessionExerciseId)
      .maybeSingle(),
    supabase
      .from("exercises")
      .select("metric, mechanic, movement_pattern, equipment_ids")
      .eq("id", input.newExerciseId)
      .maybeSingle(),
    supabase.from("profiles").select("goal, level").eq("id", userId).single(),
    supabase
      .from("session_exercises")
      .select("sessions!inner(is_deload)")
      .eq("id", input.sessionExerciseId)
      .maybeSingle(),
    supabase.from("user_settings").select("planning_mode").eq("user_id", userId).single(),
  ]);

  const current = currentRes.data as {
    id: string;
    exercise_id: string;
    metric: string;
    planned_reps_min: number;
    planned_reps_max: number;
  } | null;
  if (!current) return { ok: false, error: "Exercise not found" };

  const replacement = replacementRes.data as {
    metric: "reps" | "seconds";
    mechanic: string | null;
    movement_pattern: string;
    equipment_ids: string[];
  } | null;
  if (!replacement) return { ok: false, error: "Exercise not found" };

  const metric: "reps" | "seconds" = replacement.metric || current.metric || "reps";
  const equipmentIds = replacement?.equipment_ids ?? [];
  const profile = profileRes.data as { goal: string; level: string } | null;

  const reranged =
    metric !== current.metric && profile?.goal && profile?.level
      ? prescribe(
          profile.goal as Database["public"]["Enums"]["fitness_goal"],
          profile.level as Database["public"]["Enums"]["fitness_level"],
          replacement?.mechanic === "isolation",
          metric as "reps" | "seconds"
        )
      : null;

  const repsMin = reranged ? reranged.repsMin : current.planned_reps_min;
  const repsMax = reranged ? reranged.repsMax : current.planned_reps_max;

  const remembersWeights = (settingsRes.data as { planning_mode: string } | null)?.planning_mode !== "daily_menu";
  const progressRes = remembersWeights
    ? await supabase
        .from("exercise_progress")
        .select("current_working_weight_kg, current_target_reps")
        .eq("user_id", userId)
        .eq("exercise_id", input.newExerciseId)
        .maybeSingle()
    : { data: null };

  const newExerciseProgress = progressRes.data
    ? {
        currentWorkingWeightKg:
          (progressRes.data as { current_working_weight_kg: number | null }).current_working_weight_kg === null
            ? null
            : Number((progressRes.data as { current_working_weight_kg: number | null }).current_working_weight_kg),
        currentTargetReps:
          (progressRes.data as { current_target_reps: number | null }).current_target_reps === null
            ? null
            : (progressRes.data as { current_target_reps: number | null }).current_target_reps,
      }
    : null;

  const isDeload = !!((sessionRes.data as { sessions?: { is_deload: boolean } }) || {})?.sessions?.is_deload;

  const result = buildSwapResult({
    newExerciseProgress,
    planningMode: (settingsRes.data as { planning_mode: string } | null)?.planning_mode ?? null,
    isDeload,
    exerciseMeta: {
      mechanic: replacement?.mechanic as Database["public"]["Enums"]["mechanic_type"] | null,
      movementPattern: (replacement?.movement_pattern ?? "other") as Database["public"]["Enums"]["movement_pattern"],
      metric: metric as "reps" | "seconds",
      equipmentIds,
    },
    repsMin,
    repsMax,
  });

  const { workingWeightKg, suggestedWeightKg, targetReps } = result;

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
    ? { ok: false, error: (error as { message: string }).message }
    : {
        ok: true,
        data: {
          metric,
          repsMin,
          repsMax,
          equipmentIds,
          workingWeightKg,
          suggestedWeightKg,
          targetReps,
        },
      };
}
