/**
 * Load session summary (completed exercises with progression notes).
 *
 * FIX (a): Derive NOTE from diff between this session's prescription and
 * post-update exercise_progress. Derive PB from this session vs historical
 * (other sessions before this one), never from exercise_progress.best_e1rm.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { describePersonalBest, type PersonalBest } from "@/lib/program/progression";
import { calculateEpley1RM } from "@/lib/exercise-history/calculations";

export type SummaryNote = {
  name: string;
  message: string;
  personalBest: string | null;
};
import type { UnitsPreference } from "@/lib/units";

/**
 * Load session summary from DB with correct NOTE and PB derivation.
 *
 * NOTE: Diff between this session's prescription (session_exercises planned fields
 * + actual weight used) and post-update exercise_progress (what's prescribed next time).
 *
 * PB: This session's best (e1RM/heaviest) compared against historical best from
 * OTHER completed sessions before this one (excluding this session_id, warm-ups, skipped).
 */
export async function loadSessionSummary(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string,
): Promise<SummaryNote[]> {
  // Fetch user's units preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .eq("id", userId)
    .single();

  const { getUnitsPreference } = await import("@/lib/units");
  const units = getUnitsPreference(profile?.units);

  // Fetch this session's completed exercises with sets
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select(
      `id, exercise_id, order_index,
       exercises!session_exercises_exercise_id_fkey(name, mechanic, movement_pattern),
       planned_sets, planned_reps_min, planned_reps_max, metric, feel, status,
       session_sets(reps, weight_kg, duration_seconds, is_warmup_set)`
    )
    .eq("session_id", sessionId)
    .in("status", ["completed"])
    .order("order_index");

  if (!exercises || exercises.length === 0) return [];

  const exerciseIds = exercises.map((e) => e.exercise_id).filter(Boolean);

  // Fetch post-update exercise_progress (what's prescribed for NEXT time)
  const { data: progressRows } = await supabase
    .from("exercise_progress")
    .select("exercise_id, current_working_weight_kg, current_target_reps")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);

  const progressMap = new Map(
    (progressRows ?? []).map((p) => [p.exercise_id, p])
  );

  // Fetch historical best from OTHER sessions (for PB comparison)
  // Page the query to avoid the 1000-row cap
  const allHistoricalSets: Array<{
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    is_warmup_set: boolean;
    session_exercises: unknown;
  }> = [];
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: historicalSets } = await supabase
      .from("session_sets")
      .select(
        `reps, weight_kg, duration_seconds, is_warmup_set,
         session_exercises!inner(exercise_id, session_id, status, metric)`
      )
      .eq("user_id", userId)
      .in("session_exercises.exercise_id", exerciseIds)
      .neq("session_exercises.session_id", sessionId)
      .eq("session_exercises.status", "completed")
      .range(offset, offset + pageSize - 1);
    
    if (!historicalSets || historicalSets.length === 0) break;
    allHistoricalSets.push(...historicalSets);
    if (historicalSets.length < pageSize) break;
    offset += pageSize;
  }

  // Group historical sets by exercise_id
  const historicalByExercise = new Map<string, Array<{
    reps: number | null;
    weight_kg: number | null;
    is_warmup_set: boolean;
    metric: string;
  }>>();

  for (const set of allHistoricalSets) {
    const ex = set.session_exercises as unknown as { exercise_id: string };
    if (!ex || (Array.isArray(ex) && ex.length === 0)) continue;
    const exData = Array.isArray(ex) ? ex[0] : ex;
    const exerciseId = exData.exercise_id;
    
    if (!historicalByExercise.has(exerciseId)) {
      historicalByExercise.set(exerciseId, []);
    }
    historicalByExercise.get(exerciseId)!.push({
      reps: set.reps,
      weight_kg: set.weight_kg,
      is_warmup_set: set.is_warmup_set,
      metric: exData.metric,
    });
  }

  // Build notes for each exercise
  const notes: SummaryNote[] = [];

  for (const ex of exercises) {
    const exerciseName = (ex.exercises as unknown as { name?: string } | null)?.name ?? "";
    const sets = (ex.session_sets ?? []) as Array<{
      reps: number | null;
      weight_kg: number | null;
      duration_seconds: number | null;
      is_warmup_set: boolean;
    }>;

    const workingSets = sets.filter((s) => !s.is_warmup_set);
    if (workingSets.length === 0) continue;

    const progress = progressMap.get(ex.exercise_id);
    if (!progress) continue;

    // Derive NOTE: compare this session's prescription vs post-update progress
    const thisSessionWeight = workingSets[0]?.weight_kg ?? null;
    const nextWeight = progress.current_working_weight_kg;
    const thisSessionReps = ex.planned_reps_max ?? 12;
    const nextReps = progress.current_target_reps ?? 12;

    let message = "";
    if (nextWeight !== null && thisSessionWeight !== null) {
      const weightDiff = nextWeight - thisSessionWeight;
      if (Math.abs(weightDiff) >= 0.01) {
        if (weightDiff > 0) {
          message = `Weight up next time`;
        } else {
          message = `Weight down next time`;
        }
      } else if (nextReps !== thisSessionReps) {
        if (nextReps > thisSessionReps) {
          message = `Reps target up next time`;
        } else {
          message = `Reps target down next time`;
        }
      } else {
        message = `Held`;
      }
    } else if (nextReps !== thisSessionReps) {
      message = nextReps > thisSessionReps ? `Reps target up` : `Reps target down`;
    } else {
      message = `Held`;
    }

    // Derive PB: this session's best vs historical best
    let personalBest: PersonalBest | null = null;

    if (ex.metric === "reps" && workingSets.some((s) => s.weight_kg && s.weight_kg > 0)) {
      // Compute this session's best e1RM
      const thisE1rms = workingSets
        .filter((s) => s.reps && s.reps > 0 && s.weight_kg && s.weight_kg > 0)
        .map((s) => calculateEpley1RM(s.reps!, s.weight_kg!))
        .filter((e): e is number => e !== null);
      const thisBestE1rm = thisE1rms.length > 0 ? Math.max(...thisE1rms) : null;

      // Compute historical best e1RM
      const historicalSetsForEx = historicalByExercise.get(ex.exercise_id) ?? [];
      const historicalE1rms = historicalSetsForEx
        .filter((s) => !s.is_warmup_set && s.reps && s.reps > 0 && s.weight_kg && s.weight_kg > 0 && s.metric === "reps")
        .map((s) => calculateEpley1RM(s.reps!, s.weight_kg!))
        .filter((e): e is number => e !== null);
      const historicalBestE1rm = historicalE1rms.length > 0 ? Math.max(...historicalE1rms) : null;

      if (thisBestE1rm && (!historicalBestE1rm || thisBestE1rm > historicalBestE1rm)) {
        personalBest = { kind: "e1rm", value: thisBestE1rm };
      }
    }

    // Also check heaviest weight PB
    const thisHeaviest = workingSets
      .filter((s) => s.weight_kg && s.weight_kg > 0)
      .map((s) => s.weight_kg!)
      .reduce((max, w) => Math.max(max, w), 0);
    
    const historicalWeights = (historicalByExercise.get(ex.exercise_id) ?? [])
      .filter((s) => !s.is_warmup_set && s.weight_kg && s.weight_kg > 0)
      .map((s) => s.weight_kg!);
    const historicalHeaviest = historicalWeights.length > 0 ? Math.max(...historicalWeights) : 0;

    if (thisHeaviest > 0 && thisHeaviest > historicalHeaviest && !personalBest) {
      personalBest = { kind: "weight", value: thisHeaviest };
    }

    notes.push({
      name: exerciseName,
      message,
      personalBest: personalBest ? describePersonalBest(personalBest, units) : null,
    });
  }

  return notes;
}
