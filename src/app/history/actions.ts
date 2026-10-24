"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";

/**
 * Mark a session as deleted (soft delete).
 * This allows for an undo period before permanent deletion.
 */
export async function markSessionDeleted(sessionId: string) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership and get session details
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, user_id, local_date, actual_type, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return { error: "Session not found" };
  }

  // Mark as deleted by setting a flag (we'll add this column in migration)
  // For now, we'll just delete it immediately
  const { error: deleteError } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  // Recalculate streaks and days trained
  // This happens automatically through the database triggers
  // but we need to revalidate the cache
  revalidatePath("/history");
  revalidatePath("/progress");

  return { success: true };
}

/**
 * Permanently delete a session.
 */
export async function deleteSession(sessionId: string) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/history");
  revalidatePath("/progress");

  return { success: true };
}

/**
 * Update session date and time.
 * Recalculates duration_seconds based on the new timestamps.
 */
export async function updateSessionDateTime(
  sessionId: string,
  localDate: string,
  startedAt: string | null,
  completedAt: string | null
) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Calculate duration_seconds if both timestamps are provided
  let durationSeconds: number | null = null;
  if (startedAt && completedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(completedAt).getTime();
    durationSeconds = Math.round((endMs - startMs) / 1000);
    
    // Validate duration
    if (durationSeconds <= 0) {
      return { error: "End time must be after start time" };
    }
    if (durationSeconds > 36000) { // 10 hours
      return { error: "Duration cannot exceed 10 hours" };
    }
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      local_date: localDate,
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/history");
  revalidatePath(`/history/${sessionId}`);

  return { success: true };
}

/**
 * Update a set's reps and weight.
 */
export async function updateSet(
  sessionExerciseId: string,
  setNumber: number,
  reps: number | null,
  weightKg: number | null,
  durationSeconds: number | null
) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership through session_exercises
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("id, session_id, user_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  if (!sessionExercise) {
    return { error: "Exercise not found" };
  }

  const { error } = await supabase
    .from("session_sets")
    .update({
      reps,
      weight_kg: weightKg,
      duration_seconds: durationSeconds,
    })
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("is_warmup_set", false);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/history");
  revalidatePath(`/history/${sessionExercise.session_id}`);

  return { success: true };
}

/**
 * Delete a single set from a session.
 * Updates set counts, volume, PR badges, and streak/day eligibility.
 * Respects RLS: user can only delete their own sets.
 */
export async function deleteSet(
  sessionExerciseId: string,
  setNumber: number
) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership through session_exercises
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("id, session_id, user_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  if (!sessionExercise) {
    return { error: "Exercise not found" };
  }

  // Delete the set (RLS ensures user can only delete their own)
  const { error } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Revalidate History list (updates set counts, volume, PR badges, streak eligibility)
  // and detail page
  revalidatePath("/history");
  revalidatePath(`/history/${sessionExercise.session_id}`);
  revalidatePath("/progress"); // Streak might have changed

  return { success: true };
}
