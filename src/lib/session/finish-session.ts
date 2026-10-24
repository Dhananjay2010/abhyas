import { decideAbandonStatus, type SessionExercise } from "./abandon-session";
import { resolveStaleFinish } from "./stale-duration";
import { isStaleSession } from "./is-stale-session";
import { exerciseCompletion } from "./completion";

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// Minimal Supabase client interface
export interface SupabaseClient {
  from: (table: string) => SupabaseQueryBuilder;
}

interface SupabaseQueryBuilder {
  select: (columns: string) => SupabaseSelectBuilder;
  update: (data: Record<string, unknown>) => SupabaseUpdateBuilder;
}

interface SupabaseSelectBuilder {
  eq: (column: string, value: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
}

interface SupabaseUpdateBuilder {
  eq: (column: string, value: unknown) => SupabaseUpdateChain;
}

interface SupabaseUpdateChain {
  eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null; count: number | null }>;
}

/**
 * Core idempotent session finish logic.
 *
 * Extracted from the server action for testability. Only the first call that
 * transitions from in_progress to completed/skipped applies the outcome. Concurrent
 * or repeated calls return success without double-applying.
 *
 * Product rule: If the user logged at least one working set, the session counts
 * as completed (not skipped). Only a session with no working sets at all is marked skipped.
 * Warm-up sets don't count as training.
 *
 * For stale sessions (past-day or >3h idle), uses resolveStaleFinish to cap duration
 * at the last logged set instead of recording unrealistic times.
 */
export async function finishSessionCore(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    durationSeconds: number;
    cooldownCompleted: boolean;
  },
): Promise<Result<{ status: "completed" | "skipped" }>> {
  // Query session metadata for stale detection
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select("started_at, local_date, timezone")
    .eq("id", params.sessionId);

  if (sessionError) return { ok: false, error: sessionError.message };

  const session = Array.isArray(sessionData) && sessionData.length > 0
    ? (sessionData[0] as { started_at: string; local_date: string; timezone: string })
    : null;

  if (!session) return { ok: false, error: "Session not found" };

  // Check if any working sets were logged and get last set timestamp
  const { data: exercises, error: readError } = await supabase
    .from("session_exercises")
    .select("session_sets(id, is_warmup_set, completed_at)")
    .eq("session_id", params.sessionId);

  if (readError) return { ok: false, error: readError.message };

  // Cast to our extended type that includes completed_at
  type SessionSetWithTimestamp = {
    id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  };

  type SessionExerciseWithTimestamp = {
    session_sets: SessionSetWithTimestamp[] | null;
  };

  // Count working sets and find the last logged set timestamp
  let workingSetCount = 0;
  let lastSetCompletedAt: string | null = null;

  for (const exercise of (exercises ?? []) as SessionExerciseWithTimestamp[]) {
    for (const set of exercise.session_sets ?? []) {
      if (!set.is_warmup_set) {
        workingSetCount++;
      }
      if (set.completed_at && (!lastSetCompletedAt || set.completed_at > lastSetCompletedAt)) {
        lastSetCompletedAt = set.completed_at;
      }
    }
  }

  const now = new Date().toISOString();

  // Check if session is stale
  const stale = isStaleSession({
    startedAt: session.started_at,
    now,
    timezone: session.timezone,
  });

  let status: "completed" | "skipped";
  let endedAt: string;
  let durationSeconds: number;

  if (stale) {
    // Use stale finish logic
    const staleFinish = resolveStaleFinish({
      startedAt: session.started_at,
      lastSetCompletedAt,
      workingSetCount,
    });

    status = staleFinish.status;
    endedAt = staleFinish.endedAt;
    durationSeconds = staleFinish.durationSeconds;
  } else {
    // Normal finish: use now and client-provided duration
    status = decideAbandonStatus((exercises ?? []) as SessionExercise[]);
    endedAt = now;
    durationSeconds = params.durationSeconds;
  }

  // Clamp duration to sane range: 0 to 6 hours
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(durationSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-application on retry.
  const { error, count } = await supabase
    .from("sessions")
    .update({
      status,
      completed_at: status === "completed" ? endedAt : null,
      duration_seconds: clampedDuration,
      cooldown_completed: status === "completed" ? params.cooldownCompleted : undefined,
    })
    .eq("id", params.sessionId)
    .eq("status", "in_progress"); // Only finish once

  if (error) return { ok: false, error: error.message };

  // If 0 rows were updated, the session was already finished - re-read the actual status
  if (count === 0) {
    const { data: session, error: rereadError } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", params.sessionId);

    if (rereadError) return { ok: false, error: rereadError.message };

    const actualStatus = Array.isArray(session) && session.length > 0
      ? (session[0] as { status: string }).status
      : "skipped";

    return { ok: true, data: { status: actualStatus as "completed" | "skipped" } };
  }

  // Update exercise statuses based on logged vs planned sets
  type ExerciseForStatusUpdate = {
    id: string;
    planned_sets: number;
    status: string;
    session_sets: { id: string; is_warmup_set: boolean }[] | null;
  };

  const { data: exercisesForStatus, error: exerciseReadError } = await supabase
    .from("session_exercises")
    .select("id, planned_sets, status, session_sets(id, is_warmup_set)")
    .eq("session_id", params.sessionId);

  if (exerciseReadError) {
    return { ok: false, error: exerciseReadError.message };
  }

  // Update each exercise status if still pending
  for (const ex of (exercisesForStatus ?? []) as ExerciseForStatusUpdate[]) {
    if (ex.status !== "pending") continue;

    const workingSets = (ex.session_sets ?? []).filter((s) => !s.is_warmup_set).length;
    const completionStatus = exerciseCompletion(workingSets, ex.planned_sets);
    
    // Map completion status to database enum: "partial" counts as "completed"
    const dbStatus = completionStatus === "skipped" ? "skipped" : "completed";

    await supabase
      .from("session_exercises")
      .update({ status: dbStatus, completed_at: new Date().toISOString() })
      .eq("id", ex.id)
      .eq("status", "pending");
  }

  return { ok: true, data: { status } };
}
