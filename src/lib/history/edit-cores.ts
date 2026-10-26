/**
 * Core history edit functions that can be called from both server actions and tests.
 * 
 * These functions contain the business logic without Next.js server action wrappers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UpdateSessionDateTimeResult {
  success: boolean;
  error?: string;
}

export interface UpdateSetResult {
  success: boolean;
  error?: string;
}

export interface DeleteSetResult {
  success: true;
  sessionDeleted?: boolean;
  redirect?: string;
}

export interface DeleteSetError {
  success: false;
  error: string;
  message?: string;
}

/**
 * Core logic for updating session date and time.
 */
export async function updateSessionDateTimeCore(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  localDate: string,
  startedAt: string,
  completedAt: string,
  timezone: string,
  signupDate: string
): Promise<UpdateSessionDateTimeResult> {
  // Import validation functions
  const {
    validateTimestampsPresent,
    validateTimestampsParseable,
    validateDateNotFuture,
    validateDateAfterSignup,
    validateLocalDateMatchesStartedAt,
    checkTimeRangeOverlap,
  } = await import("./edit-validation");

  // Validate timestamps are present
  const timestampsPresent = validateTimestampsPresent(startedAt, completedAt);
  if (!timestampsPresent.valid) {
    return { success: false, error: timestampsPresent.error };
  }

  // Validate timestamps are parseable
  const timestampsParseable = validateTimestampsParseable(startedAt, completedAt);
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
  const localDateMatches = validateLocalDateMatchesStartedAt(localDate, startedAt, timezone);
  if (!localDateMatches.valid) {
    return { success: false, error: localDateMatches.error };
  }

  // Calculate duration_seconds
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
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
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .neq("id", sessionId)
    .not("started_at", "is", null)
    .not("completed_at", "is", null);

  if (existingSessions && existingSessions.length > 0) {
    const overlapCheck = checkTimeRangeOverlap(
      new Date(startedAt),
      new Date(completedAt),
      existingSessions
    );
    if (!overlapCheck.valid) {
      return { success: false, error: overlapCheck.error };
    }
  }

  const { data: updatedRows, error } = await supabase
    .from("sessions")
    .update({
      local_date: localDate,
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    console.error("Database error updating session:", error);
    return { success: false, error: "Failed to update session. Please try again." };
  }

  // Check if the session exists and belongs to the user (0 rows = revoked auth or wrong user)
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: "Couldn't save — please sign in again" };
  }

  return { success: true };
}

/**
 * Core logic for updating a set.
 */
export async function updateSetCore(
  supabase: SupabaseClient,
  userId: string,
  sessionExerciseId: string,
  setNumber: number,
  reps: number | null,
  weightKg: number | null,
  durationSeconds: number | null,
  units: "metric" | "imperial" = "metric"
): Promise<UpdateSetResult> {
  // Import validation functions
  const {
    validateReps,
    validateWeightKg,
    validateSetMetrics,
  } = await import("./edit-validation");

  // Validate reps
  const repsValidation = validateReps(reps);
  if (!repsValidation.valid) {
    return { success: false, error: repsValidation.error };
  }

  // Validate weight
  const weightValidation = validateWeightKg(weightKg, units);
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
    .eq("user_id", userId)
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

  return { success: true };
}

/**
 * Core logic for deleting a set.
 */
export async function deleteSetCore(
  supabase: SupabaseClient,
  userId: string,
  sessionExerciseId: string,
  setNumber: number,
  deleteSessionIfEmpty: boolean = false
): Promise<DeleteSetResult | DeleteSetError> {
  // Verify ownership through session_exercises
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("id, session_id, user_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", userId)
    .single();

  if (!sessionExercise) {
    return { success: false, error: "That exercise no longer exists." };
  }

  // Check if the target set is a working set (not warmup)
  const { data: targetSet } = await supabase
    .from("session_sets")
    .select("is_warmup_set")
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber)
    .eq("user_id", userId)
    .single();

  if (!targetSet) {
    return { success: false, error: "That set no longer exists." };
  }

  const targetIsWorkingSet = !targetSet.is_warmup_set;

  // Count total working sets across all exercises in this session (only if target is a working set)
  if (targetIsWorkingSet) {
    const { data: allExercises } = await supabase
      .from("session_exercises")
      .select("id")
      .eq("session_id", sessionExercise.session_id)
      .eq("user_id", userId);

    if (!allExercises || allExercises.length === 0) {
      return { success: false, error: "Session not found." };
    }

    const exerciseIds = allExercises.map((e) => e.id);

    const { count: totalWorkingSets } = await supabase
      .from("session_sets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
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
      .eq("user_id", userId)
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
      // Delete the session directly
      const { error: deleteError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionExercise.session_id)
        .eq("user_id", userId);

      if (deleteError) {
        console.error("Database error deleting session:", deleteError);
        return { success: false, error: "Failed to delete session." };
      }

      return { success: true, sessionDeleted: true, redirect: "/history" };
    }
  } else {
    // It's a warmup set - just delete it without checking last-set guard
    const { data: deletedRows, error } = await supabase
      .from("session_sets")
      .delete()
      .eq("session_exercise_id", sessionExerciseId)
      .eq("set_number", setNumber)
      .eq("user_id", userId)
      .select("id");

    if (error) {
      console.error("Database error deleting set:", error);
      return { success: false, error: "Failed to delete set. Please try again." };
    }

    // Check if the set existed
    if (!deletedRows || deletedRows.length === 0) {
      return { success: false, error: "That set no longer exists." };
    }
  }

  return { success: true };
}
