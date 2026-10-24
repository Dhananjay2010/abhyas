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

  // Validate timestamps are present before proceeding
  if (!startedAt || !completedAt) {
    return { success: false, error: "Start and end times are required." };
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

  // Call core function
  const { updateSessionDateTimeCore } = await import("@/lib/history/edit-cores");
  const result = await updateSessionDateTimeCore(
    supabase,
    user.id,
    sessionId,
    localDate,
    startedAt,
    completedAt,
    timezone,
    signupDate
  );

  if (!result.success) {
    return result;
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

  // Get session_id for revalidation
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("session_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  const { updateSetCore } = await import("@/lib/history/edit-cores");
  const result = await updateSetCore(
    supabase,
    user.id,
    sessionExerciseId,
    setNumber,
    reps,
    weightKg,
    durationSeconds
  );

  if (!result.success) {
    return result;
  }

  if (sessionExercise) {
    revalidatePath("/history");
    revalidatePath(`/history/${sessionExercise.session_id}`);
    revalidatePath("/progress");
    revalidatePath("/today");
  }

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

  // Get session_id for revalidation before delete
  const { data: sessionExercise } = await supabase
    .from("session_exercises")
    .select("session_id")
    .eq("id", sessionExerciseId)
    .eq("user_id", user.id)
    .single();

  const { deleteSetCore } = await import("@/lib/history/edit-cores");
  const result = await deleteSetCore(
    supabase,
    user.id,
    sessionExerciseId,
    setNumber,
    deleteSessionIfEmpty
  );

  if (!result.success) {
    return result;
  }

  if (result.sessionDeleted) {
    revalidatePath("/history");
    revalidatePath("/progress");
    revalidatePath("/today");
    return result;
  }

  // Revalidate History list (updates set counts, volume, PR badges, streak eligibility)
  // and detail page
  if (sessionExercise) {
    revalidatePath("/history");
    revalidatePath(`/history/${sessionExercise.session_id}`);
    revalidatePath("/progress");
    revalidatePath("/today");
  }

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
