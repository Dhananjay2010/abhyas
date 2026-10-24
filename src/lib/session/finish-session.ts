import { decideAbandonStatus, type SessionExercise } from "./abandon-session";
import { resolveStaleFinish } from "./stale-duration";
import { isStaleSession } from "./is-stale-session";
import { exerciseCompletion } from "./completion";

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// Database client interface for finish-session operations
export interface FinishSessionClient {
  from(table: "sessions"): SessionsQueryBuilder;
  from(table: "session_exercises"): SessionExercisesQueryBuilder;
}

interface SessionsQueryBuilder {
  select(columns: "started_at, local_date, timezone"): SessionsSelectBuilder;
  select(columns: "status"): SessionsStatusSelectBuilder;
  update(
    data: {
      status: string;
      completed_at: string | null;
      duration_seconds: number;
      cooldown_completed?: boolean;
    },
    options: { count: "exact" }
  ): SessionsUpdateBuilder;
}

interface SessionsSelectBuilder {
  eq(column: "id", value: string): Promise<{
    data: Array<{ started_at: string; local_date: string; timezone: string }> | null;
    error: { message: string } | null;
  }>;
}

interface SessionsStatusSelectBuilder {
  eq(column: "id", value: string): Promise<{
    data: Array<{ status: "completed" | "skipped" | "in_progress" }> | null;
    error: { message: string } | null;
  }>;
}

interface SessionsUpdateBuilder {
  eq(column: "id", value: string): SessionsUpdateChain;
}

interface SessionsUpdateChain {
  eq(column: "status", value: string): Promise<{
    error: { message: string } | null;
    count: number | null;
  }>;
}

interface SessionExercisesQueryBuilder {
  select(columns: "session_sets(id, is_warmup_set, completed_at)"): SessionExercisesSelectBuilder;
  select(columns: "id, planned_sets, status, session_sets(id, is_warmup_set)"): SessionExercisesStatusSelectBuilder;
}

interface SessionExercisesSelectBuilder {
  eq(column: "session_id", value: string): Promise<{
    data: Array<{
      session_sets: Array<{
        id: string;
        is_warmup_set: boolean;
        completed_at: string | null;
      }> | null;
    }> | null;
    error: { message: string } | null;
  }>;
}

interface SessionExercisesStatusSelectBuilder {
  eq(column: "session_id", value: string): Promise<{
    data: Array<{
      id: string;
      planned_sets: number;
      status: string;
      session_sets: Array<{
        id: string;
        is_warmup_set: boolean;
      }> | null;
    }> | null;
    error: { message: string } | null;
  }>;
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
  supabase: FinishSessionClient,
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
    ? sessionData[0]
    : null;

  if (!session) return { ok: false, error: "Session not found" };

  // Check if any working sets were logged and get last set timestamp
  const { data: exercises, error: readError } = await supabase
    .from("session_exercises")
    .select("session_sets(id, is_warmup_set, completed_at)")
    .eq("session_id", params.sessionId);

  if (readError) return { ok: false, error: readError.message };

  // Count working sets and find the last logged set timestamp
  let workingSetCount = 0;
  let lastSetCompletedAt: string | null = null;

  for (const exercise of exercises ?? []) {
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
    status = decideAbandonStatus(exercises ?? []);
    endedAt = now;
    durationSeconds = params.durationSeconds;
  }

  // Clamp duration to sane range: 0 to 6 hours
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(durationSeconds)));

  // Safety: Only update if status is 'in_progress' to prevent double-application on retry.
  const { error, count } = await supabase
    .from("sessions")
    .update(
      {
        status,
        completed_at: status === "completed" ? endedAt : null,
        duration_seconds: clampedDuration,
        cooldown_completed: status === "completed" ? params.cooldownCompleted : undefined,
      },
      { count: "exact" },
    )
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
    if (!session || session.length === 0) return { ok: false, error: "Session not found on re-read" };

    const actualStatus = session[0].status;
    return { ok: true, data: { status: actualStatus } };
  }

  // Update exercise statuses based on logged vs planned sets
  const { data: exercisesForStatus, error: exerciseReadError } = await supabase
    .from("session_exercises")
    .select("id, planned_sets, status, session_sets(id, is_warmup_set)")
    .eq("session_id", params.sessionId);

  if (exerciseReadError) {
    return { ok: false, error: exerciseReadError.message };
  }

  // Update each exercise status if still pending
  for (const ex of exercisesForStatus ?? []) {
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
