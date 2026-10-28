/**
 * Clean banned exercises from program_day_exercises for knee-injured users.
 * Server-only helper for persistent cleanup (compare-and-swap updates).
 * 
 * Called from:
 * - ensure-session-exercises (backstop before session insert)
 * - Today Server Action (on-demand cleanup)
 * 
 * Note: No explicit server-only import to allow test imports of ensure-session-exercises.
 * This file is only ever called from server contexts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { replaceBannedInPlanned, type PlannedExercise } from "@/lib/program/replace-banned-in-planned";
import { toCandidateExercises } from "@/lib/program/candidate-exercise-guard";
import { buildCleanupGeneratorInput } from "@/lib/program/apply-banned-cleanup";

export async function cleanBannedPlannedExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ cleaned: number; errors: string[] }> {
  try {
    // Load user data
    const [profileRes, injuriesRes, catalogueRes, programRes, equipmentRes] = await Promise.all([
      supabase.from("profiles").select("goal, level, primary_track, days_per_week, yoga_days_per_week, has_all_equipment").eq("id", userId).maybeSingle(),
      supabase.from("user_injuries").select("body_region, severity").eq("user_id", userId),
      supabase.from("exercises").select("id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category").eq("is_active", true),
      supabase.from("programs").select("id").eq("user_id", userId).eq("status", "active").maybeSingle(),
      supabase.from("user_equipment").select("equipment_id").eq("user_id", userId),
    ]);
    
    if (!programRes.data || !profileRes.data || !catalogueRes.data) {
      return { cleaned: 0, errors: [] };
    }
    
    const profile = profileRes.data;
    const injuries = injuriesRes.data || [];
    const catalogue = toCandidateExercises(catalogueRes.data);
    
    if (!profile.goal || !profile.level || !profile.primary_track || 
        profile.days_per_week === null || profile.days_per_week === undefined ||
        profile.yoga_days_per_week === null || profile.yoga_days_per_week === undefined) {
      return { cleaned: 0, errors: ["Incomplete profile"] };
    }
    
    const generatorInput = buildCleanupGeneratorInput(
      {
        goal: profile.goal,
        level: profile.level,
        primary_track: profile.primary_track,
        days_per_week: profile.days_per_week,
        yoga_days_per_week: profile.yoga_days_per_week,
        has_all_equipment: profile.has_all_equipment ?? true,
      },
      injuries,
      (equipmentRes.data ?? []).map(r => r.equipment_id),
      userId,
      catalogue
    );
    
    if (!generatorInput) {
      return { cleaned: 0, errors: [] };
    }
    
    const { data: days } = await supabase
      .from("program_days")
      .select("id")
      .eq("program_id", programRes.data.id)
      .eq("status", "active");
    
    if (!days || days.length === 0) {
      return { cleaned: 0, errors: [] };
    }
    
    const dayIds = days.map(d => d.id);
    
    const { data: planned } = await supabase
      .from("program_day_exercises")
      .select("id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, program_day_id")
      .in("program_day_id", dayIds);
    
    if (!planned || planned.length === 0) {
      return { cleaned: 0, errors: [] };
    }
    
    const byDay = new Map<string, PlannedExercise[]>();
    for (const ex of planned) {
      const dayId = ex.program_day_id;
      if (!byDay.has(dayId)) {
        byDay.set(dayId, []);
      }
      const dayExercises = byDay.get(dayId);
      if (dayExercises) {
        dayExercises.push({
          id: ex.id,
          exercise_id: ex.exercise_id,
          order_index: ex.order_index,
          target_sets: ex.target_sets,
          target_reps_min: ex.target_reps_min,
          target_reps_max: ex.target_reps_max,
          rest_seconds: ex.rest_seconds,
        });
      }
    }
    
    let totalCleaned = 0;
    const errors: string[] = [];
    
    for (const [, exercises] of byDay.entries()) {
      const result = replaceBannedInPlanned(exercises, catalogue, generatorInput);
      
      if (!result.changed) continue;
      
      // Build a map of original id to { originalExerciseId, replacementExerciseId }
      const replacementMap = new Map<string, { originalExerciseId: string; replacementExerciseId: string | null }>();
      let resultIdx = 0;
      for (let i = 0; i < exercises.length; i++) {
        const original = exercises[i];
        if (resultIdx < result.rows.length && result.rows[resultIdx].id === original.id) {
          const cleaned = result.rows[resultIdx];
          if (original.exercise_id !== cleaned.exercise_id) {
            replacementMap.set(original.id, {
              originalExerciseId: original.exercise_id,
              replacementExerciseId: cleaned.exercise_id,
            });
          }
          resultIdx++;
        } else {
          // Slot was dropped
          replacementMap.set(original.id, {
            originalExerciseId: original.exercise_id,
            replacementExerciseId: null,
          });
        }
      }
      
      // Apply updates and deletions with CAS
      for (const [originalId, { originalExerciseId, replacementExerciseId }] of replacementMap.entries()) {
        if (replacementExerciseId === null) {
          // Delete dropped slot
          const { error } = await supabase
            .from("program_day_exercises")
            .delete()
            .eq("id", originalId)
            .eq("exercise_id", originalExerciseId);
          
          if (error) {
            errors.push(`Failed to delete exercise ${originalId}: ${error.message}`);
          } else {
            totalCleaned++;
          }
        } else {
          // Update to replacement
          const { error } = await supabase
            .from("program_day_exercises")
            .update({ exercise_id: replacementExerciseId })
            .eq("id", originalId)
            .eq("exercise_id", originalExerciseId);
          
          if (error) {
            errors.push(`Failed to update exercise ${originalId}: ${error.message}`);
          } else {
            totalCleaned++;
          }
        }
      }
    }
    
    return { cleaned: totalCleaned, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { cleaned: 0, errors: [message] };
  }
}
