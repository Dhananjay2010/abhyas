/**
 * Ensure a session has its exercises, copying them from the program day.
 * 
 * Extracted from actions.ts to prevent exposing as a server action (MEDIUM-1).
 * Idempotent: it does nothing when rows already exist, so it is safe to call
 * on every resume.
 */

import type { Database } from "@/lib/database.types";
import { applyDeload } from "@/lib/program/prescription";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBannedCleanup } from "@/lib/program/apply-banned-cleanup";
import type { CandidateExercise } from "@/lib/program/generate";
import { cleanBannedPlannedExercises } from "@/lib/program/clean-banned-planned";
import type { ReplacementResult } from "@/lib/program/replace-banned-in-planned";

/**
 * Apply banned-exercise cleanup to planned exercises (extracted for M8 test coverage).
 */
type ProfileForCleanup = {
  goal: "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "flexibility_stress";
  level: "beginner" | "intermediate" | "expert";
  primary_track: "weights" | "bodyweight" | "yoga" | "meditation";
  days_per_week: number;
  yoga_days_per_week: number;
  has_all_equipment: boolean;
};

type InjuryForCleanup = {
  body_region: "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle" | "core";
  severity: "current" | "past";
};

export function applyEnsureSessionCleanup(
  planned: Array<{
    id: string;
    exercise_id: string;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
  }>,
  catalogue: CandidateExercise[],
  profile: ProfileForCleanup,
  injuries: Array<InjuryForCleanup>,
  userId: string,
  equipmentIds: string[]
): ReplacementResult {
  const plannedForCleaning = planned.map(p => ({
    id: p.id,
    exercise_id: p.exercise_id,
    order_index: p.order_index,
    target_sets: p.target_sets,
    target_reps_min: p.target_reps_min,
    target_reps_max: p.target_reps_max,
    rest_seconds: p.rest_seconds,
  }));
  
  const { replaceBannedInPlanned } = require("@/lib/program/replace-banned-in-planned");
  const { buildInjuryFlags } = require("@/lib/program/injury-regions");
  
  const { currentInjuryRegions, anyKneeInjury } = buildInjuryFlags(injuries);
  
  if (!anyKneeInjury) {
    return { rows: plannedForCleaning, changed: false };
  }
  
  const generatorInput = {
    userId,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week,
    age: null,
    bmi: null,
    hasAllEquipment: profile.has_all_equipment,
    equipmentIds,
    currentInjuryRegions,
    anyKneeInjury,
    catalogue,
  };
  
  return replaceBannedInPlanned(plannedForCleaning, catalogue, generatorInput);
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

export async function ensureSessionExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  catalogue?: CandidateExercise[],
  profile?: {
    goal: Database["public"]["Enums"]["fitness_goal"];
    level: Database["public"]["Enums"]["fitness_level"];
    primary_track: Database["public"]["Enums"]["track_type"];
    days_per_week: number;
    yoga_days_per_week: number;
    has_all_equipment: boolean;
  } | null,
  injuries?: Array<{ body_region: Database["public"]["Enums"]["body_region"]; severity: "current" | "past" }>,
  equipmentIds?: string[],
): Promise<void> {
  // One round trip answers both questions this needs: whether the session
  // already has exercises, and which program day to copy them from. It used to
  // ask them separately, on the resume path, which is the path a user takes
  // when they have already been waiting once.
  const { data: session } = await supabase
    .from("sessions")
    .select("program_day_id, actual_type, is_deload, session_exercises(id)")
    .eq("id", sessionId)
    .maybeSingle();

  if ((session?.session_exercises ?? []).length > 0) return;

  // Yoga and breathing sessions have no exercises by design.
  if (!session?.program_day_id) return;
  if (session.actual_type === "yoga" || session.actual_type === "meditation") return;

  const { data: planned } = await supabase
    .from("program_day_exercises")
    .select("id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric)")
    .eq("program_day_id", session.program_day_id)
    .order("order_index");
  if (!planned || planned.length === 0) return;

  // Clean banned exercises in-memory (backstop), then persist if needed
  let cleanedPlanned = planned;
  if (catalogue && profile && injuries && equipmentIds) {
    const cleaned = applyEnsureSessionCleanup(planned, catalogue, profile, injuries, userId, equipmentIds);
    
    // Persist cleaned exercises to program_day_exercises
    if (cleaned.changed) {
      await cleanBannedPlannedExercises(supabase, userId);
    }
    
    const cleanedMap = new Map(cleaned.rows.map(c => [c.id, c.exercise_id]));
    cleanedPlanned = planned
      .map(p => {
        const cleanedExerciseId = cleanedMap.get(p.id);
        if (cleanedExerciseId === undefined) {
          return null;
        }
        return {
          ...p,
          exercise_id: cleanedExerciseId,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }

  // HIGH-2: Apply deload the same way as the fresh start path (actions.ts:232)
  const isDeload = session.is_deload ?? false;

  await supabase.from("session_exercises").insert(
    cleanedPlanned.map((p) => {
      const prescription = {
        sets: p.target_sets ?? 0,
        repsMin: p.target_reps_min ?? 0,
        repsMax: p.target_reps_max ?? 0,
        restSeconds: p.rest_seconds ?? 0,
      };
      
      // Apply deload transform when needed
      const transformed = isDeload ? applyDeload(prescription) : prescription;
      
      return {
        session_id: sessionId,
        user_id: userId,
        exercise_id: p.exercise_id,
        order_index: p.order_index,
        planned_sets: transformed.sets,
        planned_reps_min: transformed.repsMin,
        planned_reps_max: transformed.repsMax,
        rest_seconds: transformed.restSeconds,
        metric: metricOf(p.exercises),
      };
    }),
  );
}
