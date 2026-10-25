/**
 * Core logic for the full startSession flow, extracted from actions.ts
 * to make it testable without 'use server' constraints.
 * 
 * Takes small typed dependency functions instead of raw supabase client,
 * making it easy to test with plain typed fakes (no network, no `as`, no `!`).
 */
import type { Database } from "@/lib/database.types";
import { localDateString, isoWeekday } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { cycleWeekFor } from "@/lib/program/block-range";
import { applyDeload } from "@/lib/program/prescription";
import { pickReusableSession } from "@/lib/session/reusable-session";
import type { StartSessionStaleDeps } from "./start-session-stale-core";
import { startSessionStaleCore } from "./start-session-stale-core";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

type SessionExerciseInsert = {
  session_id: string;
  user_id: string;
  exercise_id: string;
  order_index: number;
  planned_sets: number;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  rest_seconds: number;
  metric: "reps" | "seconds";
};

export type OpenSession = {
  id: string;
  status: string;
  local_date: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  started_at: string | null;
};

export type ProgramDayExercise = {
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  exercises: { metric: string } | { metric: string }[];
};

export type StartSessionFullDeps = {
  userId: string;
  nowMs: number;
  
  fetchProfile: () => Promise<{ timezone?: string | null } | null>;
  fetchOpenSessions: () => Promise<OpenSession[]>;
  fetchResumeEnabled: () => Promise<boolean>;
  
  updateSession: (sessionId: string, today: string, payload: { status: "in_progress"; started_at?: string }) => Promise<{ ok: true; sessionId: string } | { ok: false; error: string }>;
  ensureSessionExercises: (sessionId: string) => Promise<void>;
  
  ensureCurrentBlock: (today: string) => Promise<
    | { status: "none" }
    | { status: "current"; programId: string }
    | { status: "rolled_over"; programId: string }
    | { status: "error"; error: string }
  >;
  
  loadProgram: (programId: string, dayIndex: number) => Promise<
    | { ok: true; program: { id: string; started_on: string; deload_week: number; week_offset: number }; dayId: string; dayType: Database["public"]["Enums"]["day_type"] }
    | { ok: false; error: string }
  >;
  
  findInProgressToday: (today: string) => Promise<SessionRow[]>;
  
  buildStaleDeps: (openSessions: OpenSession[], today: string, nowMs: number) => StartSessionStaleDeps;
  
  insertSession: (payload: SessionInsert) => Promise<
    | { ok: true; sessionId: string }
    | { ok: true; existingSessionId: string }
    | { ok: false; error: string }
  >;
  
  fetchPlannedExercises: (dayId: string) => Promise<ProgramDayExercise[] | null>;
  
  insertExercises: (exercises: SessionExerciseInsert[]) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export type StartSessionFullResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

function metricOf(embedded: unknown): Database["public"]["Enums"]["exercise_metric"] {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const m = row && typeof row === "object" && "metric" in row ? (row as { metric?: string }).metric : undefined;
  return m === "seconds" ? "seconds" : "reps";
}

/**
 * Full startSession flow core logic.
 * Testable via plain typed fake functions.
 */
export async function startSessionFullCore(
  deps: StartSessionFullDeps
): Promise<StartSessionFullResult> {
  const { userId, nowMs } = deps;
  
  // ---- wave 1 -------------------------------------------------------------
  const [profile, openSessions, resumeEnabled] = await Promise.all([
    deps.fetchProfile(),
    deps.fetchOpenSessions(),
    deps.fetchResumeEnabled(),
  ]);

  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  const today = localDateString(timezone, new Date(nowMs));

  const todayRows = openSessions.filter((s) => s.local_date === today);
  const existing = pickReusableSession(todayRows, resumeEnabled);

  if (existing) {
    const updatePayload = {
      status: "in_progress" as const,
      ...(existing.started_at === null || existing.status === "skipped"
        ? { started_at: new Date(nowMs).toISOString() }
        : {}),
    };

    const [updateResult] = await Promise.all([
      deps.updateSession(existing.id, today, updatePayload),
      deps.ensureSessionExercises(existing.id),
    ]);
    if (!updateResult.ok) {
      return { ok: false, error: updateResult.error };
    }

    return { ok: true, sessionId: updateResult.sessionId };
  }

  // Ensure we have a current block
  const rolloverResult = await deps.ensureCurrentBlock(today);
  if (rolloverResult.status === "none") {
    return { ok: false, error: "You have no active training block." };
  }
  if (rolloverResult.status === "error") {
    return { ok: false, error: rolloverResult.error };
  }

  const dayIndex = isoWeekday(today);

  const loadResult = await deps.loadProgram(rolloverResult.programId, dayIndex);
  if (!loadResult.ok) return { ok: false, error: loadResult.error };

  const { program, dayId, dayType } = loadResult;

  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, today);
  const isDeloadWeek = week === program.deload_week;

  // ---- wave 2 -------------------------------------------------------------
  // Case C: Idempotent session start
  const existingInProgress = await deps.findInProgressToday(today);
  if (existingInProgress.length > 0) {
    return { ok: true, sessionId: existingInProgress[0].id };
  }

  // L3: Close stale sessions
  const staleDeps = deps.buildStaleDeps(openSessions, today, nowMs);
  const staleResult = await startSessionStaleCore(staleDeps);
  if (!staleResult.ok) {
    return { ok: false, error: staleResult.error };
  }

  // #111: Resume fresh cross-date session
  if (!staleResult.shouldInsert) {
    return { ok: true, sessionId: staleResult.resumeSessionId };
  }

  // Insert new session
  const insertResult = await deps.insertSession({
    user_id: userId,
    program_id: program.id,
    program_day_id: dayId,
    local_date: today,
    week_in_block: week,
    is_deload: isDeloadWeek,
    planned_type: dayType,
    actual_type: dayType,
    status: "in_progress",
    started_at: new Date(nowMs).toISOString(),
  });

  if (!insertResult.ok) {
    if ("existingSessionId" in insertResult) {
      return { ok: true, sessionId: insertResult.existingSessionId };
    }
    return { ok: false, error: insertResult.error };
  }

  const sessionId = "sessionId" in insertResult ? insertResult.sessionId : insertResult.existingSessionId;

  // Insert exercises
  const planned = await deps.fetchPlannedExercises(dayId);
  if (planned && planned.length > 0) {
    const exercisesToInsert = planned.map((p) => {
      const dose = isDeloadWeek
        ? applyDeload({
            sets: p.target_sets,
            repsMin: p.target_reps_min,
            repsMax: p.target_reps_max,
            restSeconds: p.rest_seconds,
          })
        : {
            sets: p.target_sets,
            repsMin: p.target_reps_min,
            repsMax: p.target_reps_max,
            restSeconds: p.rest_seconds,
          };
      return {
        session_id: sessionId,
        user_id: userId,
        exercise_id: p.exercise_id,
        order_index: p.order_index,
        planned_sets: dose.sets,
        planned_reps_min: dose.repsMin,
        planned_reps_max: dose.repsMax,
        rest_seconds: dose.restSeconds,
        metric: metricOf(p.exercises),
      };
    });

    const exerciseInsertResult = await deps.insertExercises(exercisesToInsert);
    if (!exerciseInsertResult.ok) {
      return { ok: false, error: exerciseInsertResult.error };
    }
  }

  return { ok: true, sessionId };
}
