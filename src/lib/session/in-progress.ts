import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isSessionStale } from "@/lib/session/close-stale";
import { localDateString } from "@/lib/dates";

type DbClient = SupabaseClient<Database>;

export type InProgressSession = {
  id: string;
  title: string;
  workingSetsLogged: number;
  startedAt: string;
};

/**
 * Get the user's in-progress session, if one exists and is not stale.
 * 
 * Returns the session's id, title (exercise label), count of working sets
 * logged (warm-ups are excluded), and when it was started (ISO timestamp).
 * 
 * Returns null if:
 * - The user has no in-progress session, OR
 * - The in-progress session is stale per #111's rule (>= 6h inactive or superseded)
 * 
 * Staleness check: applies #111's EXACT rule (isSessionStale) without closing the
 * session. A separate background job auto-closes stale sessions on Today.
 * Migration 000022 enforces at most one in_progress session per user.
 * 
 * Read-only: this query does not modify any data.
 */
export async function getInProgressSession(
  supabase: DbClient,
  userId: string
): Promise<InProgressSession | null> {
  // Find the user's in_progress session, regardless of local_date
  const { data: sessions, error: sessionError } = await supabase
    .from("sessions")
    .select("id, started_at, local_date, status, actual_type, program_days(label)")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (sessionError || !sessions || sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  // Apply #111's staleness check before returning the session
  // First, get the session's exercises
  const { data: sessionExercisesForStale } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", session.id);

  const exerciseIdsForStale = sessionExercisesForStale?.map((e) => e.id) ?? [];

  // Get the last working set's completed_at for staleness calculation
  let lastSetCompletedAt: string | null = null;
  if (exerciseIdsForStale.length > 0) {
    const { data: lastSetData } = await supabase
      .from("session_sets")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("is_warmup_set", false)
      .in("session_exercise_id", exerciseIdsForStale)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1);

    lastSetCompletedAt = lastSetData?.[0]?.completed_at ?? null;
  }

  // For strength sessions, check if a newer strength session exists
  let newestStrengthStartedAt: string | null = null;
  const isStrength = session.actual_type === "weights" || session.actual_type === "bodyweight";
  if (isStrength) {
    const { data: newestStrength } = await supabase
      .from("sessions")
      .select("started_at")
      .eq("user_id", userId)
      .in("actual_type", ["weights", "bodyweight"])
      .not("started_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1);
    
    newestStrengthStartedAt = newestStrength?.[0]?.started_at ?? null;
  }

  // Check staleness using #111's exact rule
  const today = localDateString("UTC"); // Use UTC for consistency with close-stale
  const nowMs = Date.now();
  
  if (isSessionStale({
    startedAt: session.started_at,
    lastSetCompletedAt,
    localDate: session.local_date,
    status: session.status,
    actualType: session.actual_type,
    newestStrengthStartedAt,
    today,
    nowMs,
  })) {
    return null;
  }

  // Session is not stale - get the full details
  // Get the session's exercise IDs first
  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", session.id);

  if (exercisesError || !exercises || exercises.length === 0) {
    // Session exists but has no exercises yet
    const programDay = session.program_days as unknown as { label: string } | null;
    return {
      id: session.id,
      title: programDay?.label ?? "Workout",
      workingSetsLogged: 0,
      startedAt: session.started_at ?? new Date().toISOString(),
    };
  }

  const exerciseIds = exercises.map((e) => e.id);

  // Count working sets (is_warmup_set = false)
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_warmup_set", false)
    .in("session_exercise_id", exerciseIds);

  if (setsError) {
    return null;
  }

  const programDay = session.program_days as unknown as { label: string } | null;
  const title = programDay?.label ?? "Workout";
  const workingSetsLogged = sets?.length ?? 0;

  return {
    id: session.id,
    title,
    workingSetsLogged,
    startedAt: session.started_at ?? new Date().toISOString(),
  };
}
