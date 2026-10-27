/**
 * Clean banned exercises from program_day_exercises for knee-injured users.
 * Server-only helper called from ensure-session-exercises and Today's Server Action.
 * 
 * Uses compare-and-swap updates on program_day_exercises only.
 * Never touches session_exercises or session_sets.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { replaceBannedInPlanned, type PlannedExercise } from "@/lib/program/replace-banned-in-planned";
import type { GeneratorInput, CandidateExercise } from "@/lib/program/generate";

export async function cleanBannedPlannedExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
  generatorInput: GeneratorInput,
  catalogue: CandidateExercise[],
): Promise<{ cleaned: number; errors: string[] }> {
  try {
    const tier = generatorInput.anyKneeInjury
      ? generatorInput.currentInjuryRegions.includes("knee")
        ? "current"
        : "past"
      : null;
    
    if (!tier) {
      return { cleaned: 0, errors: [] };
    }
    
    const { data: program } = await supabase
      .from("programs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    
    if (!program) {
      return { cleaned: 0, errors: [] };
    }
    
    const { data: days } = await supabase
      .from("program_days")
      .select("id")
      .eq("program_id", program.id)
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
    
    for (const [, exercises] of byDay) {
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
