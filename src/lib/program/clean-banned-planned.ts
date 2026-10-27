/**
 * Clean banned exercises from program_day_exercises for knee-injured users.
 * Server-only helper for persistent cleanup (compare-and-swap updates).
 * 
 * Called from:
 * - ensure-session-exercises (backstop before session insert)
 * - Today Server Action (on-demand cleanup)
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { replaceBannedInPlanned, type PlannedExercise } from "@/lib/program/replace-banned-in-planned";
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { buildInjuryFlags } from "@/lib/program/injury-regions";

export async function cleanBannedPlannedExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ cleaned: number; errors: string[] }> {
  try {
    // Load user data
    const [profileRes, injuriesRes, catalogueRes, programRes] = await Promise.all([
      supabase.from("profiles").select("goal, level, primary_track, days_per_week, yoga_days_per_week, has_all_equipment").eq("id", userId).single(),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase.from("exercises").select("id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category").eq("is_active", true),
      supabase.from("programs").select("id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    ]);
    
    if (!programRes.data || !profileRes.data || !catalogueRes.data) {
      return { cleaned: 0, errors: [] };
    }
    
    const profile = profileRes.data;
    const injuries = injuriesRes.data || [];
    const catalogue = catalogueRes.data as CandidateExercise[];
    
    const { currentInjuryRegions, anyKneeInjury } = buildInjuryFlags(injuries);
    
    if (!anyKneeInjury) {
      return { cleaned: 0, errors: [] };
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
      hasAllEquipment: profile.has_all_equipment,
      equipmentIds: [],
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
      byDay.get(dayId)!.push({
        id: ex.id,
        exercise_id: ex.exercise_id,
        order_index: ex.order_index,
        target_sets: ex.target_sets,
        target_reps_min: ex.target_reps_min,
        target_reps_max: ex.target_reps_max,
        rest_seconds: ex.rest_seconds,
      });
    }
    
    let totalCleaned = 0;
    const errors: string[] = [];
    
    for (const exercises of byDay.values()) {
      const result = replaceBannedInPlanned(exercises, catalogue, generatorInput);
      
      if (!result.changed) continue;
      
      for (let i = 0; i < exercises.length; i++) {
        const original = exercises[i];
        const cleaned = result.rows[i];
        
        if (original.exercise_id !== cleaned.exercise_id) {
          const { error } = await supabase
            .from("program_day_exercises")
            .update({ exercise_id: cleaned.exercise_id })
            .eq("id", original.id)
            .eq("exercise_id", original.exercise_id);
          
          if (error) {
            errors.push(`Failed to update exercise ${original.id}: ${error.message}`);
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
