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
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { buildInjuryFlags } from "@/lib/program/injury-regions";
import { toCandidateExercises } from "@/lib/program/candidate-exercise-guard";

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
    
    const { currentInjuryRegions, anyKneeInjury } = buildInjuryFlags(injuries);
    
    if (!anyKneeInjury) {
      return { cleaned: 0, errors: [] };
    }
    
    if (!profile.goal || !profile.level || !profile.primary_track || 
        profile.days_per_week === null || profile.days_per_week === undefined ||
        profile.yoga_days_per_week === null || profile.yoga_days_per_week === undefined) {
      return { cleaned: 0, errors: ["Incomplete profile"] };
    }
    
    const generatorInput: GeneratorInput = {
      userId,
      blockNumber: 1,
      goal: profile.goal,
      level: profile.level,
      primaryTrack: profile.primary_track,
      daysPerWeek: profile.days_per_week,
      yogaDaysPerWeek: profile.yoga_days_per_week,
      age: null,
      bmi: null,
      hasAllEquipment: profile.has_all_equipment ?? true,
      equipmentIds: (equipmentRes.data ?? []).map(r => r.equipment_id),
      currentInjuryRegions,
      anyKneeInjury,
      catalogue,
    };
    
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
    
    for (const [dayId, exercises] of byDay.entries()) {
      // Logged-sets guard: never modify days that have sessions with logged sets
      const { data: sessionsWithSets } = await supabase
        .from("sessions")
        .select("id, session_exercises!inner(id, session_sets!inner(id))")
        .eq("program_day_id", dayId)
        .eq("user_id", userId);
      
      const hasLoggedSets = (sessionsWithSets ?? []).some(s => 
        (s.session_exercises ?? []).some((se: any) => (se.session_sets ?? []).length > 0)
      );
      
      if (hasLoggedSets) {
        // Skip this day - it has logged sets
        continue;
      }
      
      const result = replaceBannedInPlanned(exercises, catalogue, generatorInput);
      
      if (!result.changed) continue;
      
      // Build a map of original exercise_id to replacement
      const replacementMap = new Map<string, string | null>();
      let resultIdx = 0;
      for (let i = 0; i < exercises.length; i++) {
        const original = exercises[i];
        if (resultIdx < result.rows.length && result.rows[resultIdx].id === original.id) {
          const cleaned = result.rows[resultIdx];
          if (original.exercise_id !== cleaned.exercise_id) {
            replacementMap.set(original.id, cleaned.exercise_id);
          }
          resultIdx++;
        } else {
          // Slot was dropped
          replacementMap.set(original.id, null);
        }
      }
      
      // Apply updates and deletions
      for (const [originalId, replacementExerciseId] of replacementMap.entries()) {
        if (replacementExerciseId === null) {
          // Delete dropped slot
          const { error } = await supabase
            .from("program_day_exercises")
            .delete()
            .eq("id", originalId);
          
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
            .eq("id", originalId);
          
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
