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

/**
 * M2, (d): Close out a past-day in-progress session.
 *
 * Past-day in-progress sessions are not resumable and must be manually closed
 * out from History. Uses resolveStaleFinish to set duration (last set time - start,
 * or 0 for zero-set sessions), endedAt, and status (completed/skipped).
 *
 * This action is only intended for past-day in-progress sessions displayed in
 * History with a "Close out" button.
 */
export async function closeOutSession(sessionId: string) {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership and get session started_at
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, status, started_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return { error: "Session not found" };
  }

  if (session.status !== "in_progress") {
    return { error: "Session is not in progress" };
  }

  if (!session.started_at) {
    return { error: "Session missing started_at timestamp" };
  }

  // Get exercises for this session
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", sessionId);

  if (!exercises || exercises.length === 0) {
    // No exercises: skipped, 0 duration
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "skipped",
        duration_seconds: 0,
        completed_at: session.started_at,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath("/history");
    revalidatePath("/progress");
    return { success: true };
  }

  const exerciseIds = exercises.map((e) => e.id);

  // Count working sets (is_warmup_set = false)
  const { data: workingSets } = await supabase
    .from("session_sets")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_warmup_set", false)
    .in("session_exercise_id", exerciseIds);

  const workingSetCount = workingSets?.length ?? 0;

  // Get max completed_at across ALL logged sets (warm-up or working)
  const { data: allSets } = await supabase
    .from("session_sets")
    .select("completed_at")
    .eq("user_id", user.id)
    .in("session_exercise_id", exerciseIds)
    .order("completed_at", { ascending: false })
    .limit(1);

  const lastSetCompletedAt = allSets?.[0]?.completed_at ?? null;

  // (d) Use shared stale-finish helper
  const { resolveStaleFinish } = await import("@/lib/session/stale-duration");
  const { durationSeconds, endedAt, status } = resolveStaleFinish({
    startedAt: session.started_at,
    lastSetCompletedAt,
    workingSetCount,
  });

  // Update session with resolved values
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status,
      duration_seconds: durationSeconds,
      completed_at: endedAt,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/history");
  revalidatePath("/progress");

  return { success: true };
}
