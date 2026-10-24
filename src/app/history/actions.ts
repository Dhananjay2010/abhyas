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
    return { success: false, error: "Not authenticated" };
  }

  // Get profile for timezone and signup date
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, created_at")
    .eq("id", user.id)
    .single();

  const { resolveTimezoneWithProfile } = await import("@/lib/timezone");
  const timezone = resolveTimezoneWithProfile(profile?.timezone);

  // Get user's auth signup date as fallback
  const { data: authUser } = await supabase.auth.getUser();
  const signupDate = profile?.created_at || authUser?.user?.created_at;

  if (!signupDate) {
    return { success: false, error: "Unable to determine signup date." };
  }

  // Import validation functions
  const {
    validateTimestampsPresent,
    validateTimestampsParseable,
    validateDateNotFuture,
    validateDateAfterSignup,
    validateLocalDateMatchesStartedAt,
    checkTimeRangeOverlap,
  } = await import("@/lib/history/edit-validation");

  // Validate timestamps are present
  const timestampsPresent = validateTimestampsPresent(startedAt, completedAt);
  if (!timestampsPresent.valid) {
    return { success: false, error: timestampsPresent.error };
  }

  // Validate timestamps are parseable
  const timestampsParseable = validateTimestampsParseable(startedAt!, completedAt!);
  if (!timestampsParseable.valid) {
    return { success: false, error: timestampsParseable.error };
  }

  // Validate date is not in the future
  const dateNotFuture = validateDateNotFuture(localDate, timezone);
  if (!dateNotFuture.valid) {
    return { success: false, error: dateNotFuture.error };
  }

  // Validate date is after signup
  const dateAfterSignup = validateDateAfterSignup(localDate, signupDate, timezone);
  if (!dateAfterSignup.valid) {
    return { success: false, error: dateAfterSignup.error };
  }

  // Validate local_date matches started_at in member's timezone
  const localDateMatches = validateLocalDateMatchesStartedAt(localDate, startedAt!, timezone);
  if (!localDateMatches.valid) {
    return { success: false, error: localDateMatches.error };
  }

  // Calculate duration_seconds
  const startMs = new Date(startedAt!).getTime();
  const endMs = new Date(completedAt!).getTime();
  const durationSeconds = Math.round((endMs - startMs) / 1000);

  // Validate duration
  if (durationSeconds <= 0) {
    return { success: false, error: "End time must be after start time." };
  }
  if (durationSeconds > 36000) { // 10 hours
    return { success: false, error: "Duration cannot exceed 10 hours." };
  }

  // Check for overlapping sessions on the same date
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("id, started_at, completed_at")
    .eq("user_id", user.id)
    .eq("local_date", localDate)
    .neq("id", sessionId)
    .not("started_at", "is", null)
    .not("completed_at", "is", null);

  if (existingSessions && existingSessions.length > 0) {
    const overlapCheck = checkTimeRangeOverlap(
      new Date(startedAt!),
      new Date(completedAt!),
      existingSessions
    );
    if (!overlapCheck.valid) {
      return { success: false, error: overlapCheck.error };
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
    console.error("Database error updating session:", error);
    return { success: false, error: "Failed to update session. Please try again." };
  }

  revalidatePath("/history");
  revalidatePath(`/history/${sessionId}`);
  revalidatePath("/progress");
  revalidatePath("/today");

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
    return { success: false, error: "Not authenticated" };
  }

  // Import validation functions
  const {
    validateReps,
    validateWeightKg,
    validateSetMetrics,
  } = await import("@/lib/history/edit-validation");

  // Validate reps
  const repsValidation = validateReps(reps);
  if (!repsValidation.valid) {
    return { success: false, error: repsValidation.error };
  }

  // Validate weight
  const weightValidation = validateWeightKg(weightKg);
  if (!weightValidation.valid) {
    return { success: false, error: weightValidation.error };
  }

  // Validate that at least one metric is present
  const metricsValidation = validateSetMetrics(reps, weightKg, durationSeconds);
  if (!metricsValidation.valid) {
    return { success: false, error: metricsValidation.error };
  }

  // Verify ownership through session_exercises
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("id, session_id, user_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  if (!sessionExercise) {
    return { success: false, error: "That exercise no longer exists." };
  }

  const { data: updatedRows, error } = await supabase
    .from("session_sets")
    .update({
      reps,
      weight_kg: weightKg,
      duration_seconds: durationSeconds,
    })
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("is_warmup_set", false)
    .select("id");

  if (error) {
    console.error("Database error updating set:", error);
    return { success: false, error: "Failed to update set. Please try again." };
  }

  // Check if the set exists
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: "That set no longer exists." };
  }

  revalidatePath("/history");
  revalidatePath(`/history/${sessionExercise.session_id}`);
  revalidatePath("/progress");
  revalidatePath("/today");

  return { success: true };
}

/**
 * Delete a single set from a session.
 * Updates set counts, volume, PR badges, and streak/day eligibility.
 * Respects RLS: user can only delete their own sets.
 * 
 * If deleteSessionIfEmpty is true and this is the last working set,
 * the entire session will be deleted.
 */
export async function deleteSet(
  sessionExerciseId: string,
  setNumber: number,
  deleteSessionIfEmpty: boolean = false
): Promise<
  | { success: true; sessionDeleted?: boolean; redirect?: string }
  | { success: false; error: string; message?: string }
> {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify ownership through session_exercises
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("id, session_id, user_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  if (!sessionExercise) {
    return { success: false, error: "That exercise no longer exists." };
  }

  // Count total working sets across all exercises in this session
  const { data: allExercises } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", sessionExercise.session_id)
    .eq("user_id", user.id);

  if (!allExercises || allExercises.length === 0) {
    return { success: false, error: "Session not found." };
  }

  const exerciseIds = allExercises.map((e) => e.id);

  const { count: totalWorkingSets } = await supabase
    .from("session_sets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_warmup_set", false)
    .in("session_exercise_id", exerciseIds);

  // If this is the last working set and deleteSessionIfEmpty is false, refuse
  if (totalWorkingSets === 1 && !deleteSessionIfEmpty) {
    return {
      success: false,
      error: "last_set",
      message: "This is the last set. Delete the whole session?",
    };
  }

  // Delete the set (RLS ensures user can only delete their own)
  const { data: deletedRows, error } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("Database error deleting set:", error);
    return { success: false, error: "Failed to delete set. Please try again." };
  }

  // Check if the set existed
  if (!deletedRows || deletedRows.length === 0) {
    return { success: false, error: "That set no longer exists." };
  }

  // If this was the last working set and deleteSessionIfEmpty is true, delete the session
  if (totalWorkingSets === 1 && deleteSessionIfEmpty) {
    const deleteResult = await deleteSession(sessionExercise.session_id);
    if (!deleteResult.success) {
      return deleteResult;
    }
    return { success: true, sessionDeleted: true, redirect: "/history" };
  }

  // Revalidate History list (updates set counts, volume, PR badges, streak eligibility)
  // and detail page
  revalidatePath("/history");
  revalidatePath(`/history/${sessionExercise.session_id}`);
  revalidatePath("/progress");
  revalidatePath("/today");

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
