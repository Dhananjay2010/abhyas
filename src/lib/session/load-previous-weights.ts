import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Load the actual logged weight from the most recent completed session for each exercise.
 * 
 * This is used to detect prescribed increases (M1 logic): if suggested > previous + 0.01,
 * the runner should floor to 0.5 lb; otherwise it rounds to nearest 0.5 lb.
 * 
 * @param client Supabase client
 * @param userId The user's ID
 * @param exerciseIds Array of exercise IDs to look up
 * @returns Map of exercise_id -> previous completed weight in kg
 */
export async function loadPreviousCompletedWeights(
  client: SupabaseClient<Database>,
  userId: string,
  exerciseIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  if (exerciseIds.length === 0) {
    return result;
  }

  // Query: get all completed sessions with their exercises and working sets
  const { data, error } = await client
    .from("sessions")
    .select(`
      id,
      local_date,
      started_at,
      session_exercises!inner(
        exercise_id,
        session_sets!inner(weight_kg, is_warmup_set)
      )
    `)
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("session_exercises.exercise_id", exerciseIds)
    .order("started_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return result;
  }

  // Process: for each exercise, find most recent session and take max working-set weight
  const byExercise = new Map<string, Array<{ weight: number; started_at: string }>>();
  
  for (const session of data) {
    const exercises = session.session_exercises as unknown as Array<{
      exercise_id: string;
      session_sets: Array<{ weight_kg: number | null; is_warmup_set: boolean }>;
    }>;
    
    for (const exercise of exercises) {
      if (!exercise.exercise_id || !exercise.session_sets) continue;
      
      // Get max working-set weight (exclude warm-ups)
      const workingWeights = exercise.session_sets
        .filter((s) => !s.is_warmup_set && s.weight_kg !== null && s.weight_kg > 0)
        .map((s) => s.weight_kg as number);
      
      if (workingWeights.length === 0) continue;
      
      const maxWeight = Math.max(...workingWeights);
      const existing = byExercise.get(exercise.exercise_id) ?? [];
      existing.push({ weight: maxWeight, started_at: session.started_at ?? session.local_date });
      byExercise.set(exercise.exercise_id, existing);
    }
  }
  
  // Take the most recent entry for each exercise
  for (const [exerciseId, entries] of byExercise.entries()) {
    entries.sort((a, b) => b.started_at.localeCompare(a.started_at));
    result.set(exerciseId, entries[0].weight);
  }
  
  return result;
}
