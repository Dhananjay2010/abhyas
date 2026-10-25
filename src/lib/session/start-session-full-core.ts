/**
 * Core logic for the full startSession flow, extracted from actions.ts
 * to make it testable without 'use server' constraints.
 * 
 * This handles:
 * - Resume logic (#111)
 * - Case C (idempotent same-date in_progress check)
 * - L3 (stale session closing before insert)
 * - Session insert
 * - Exercise insert
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { localDateString, isoWeekday } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { cycleWeekFor } from "@/lib/program/block-range";
import { applyDeload } from "@/lib/program/prescription";
import { pickReusableSession } from "@/lib/session/reusable-session";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { loadStartProgram, createSupabaseDeps as createLoadStartProgramDeps } from "./load-start-program";
import { startSessionCore } from "./start-session-core";
import { updateSessionCore } from "./update-session-core";
import { ensureSessionExercises } from "./ensure-session-exercises";
import { insertSessionExercises } from "./insert-session-exercises";
import { buildStartSessionStaleDeps } from "./build-start-session-stale-deps";
import { startSessionStaleCore } from "./start-session-stale-core";

export type StartSessionFullDeps = {
  supabase: SupabaseClient<Database>;
  userId: string;
  nowMs: number;
};

export type StartSessionFullResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

function metricOf(embedded: unknown): Database["public"]["Enums"]["exercise_metric"] {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const m = (row as { metric?: string } | null | undefined)?.metric;
  return m === "seconds" ? "seconds" : "reps";
}

/**
 * Full startSession flow core logic.
 * Testable via fake-postgrest by injecting a real supabase client with stub fetch.
 */
export async function startSessionFullCore(
  deps: StartSessionFullDeps
): Promise<StartSessionFullResult> {
  const { supabase, userId, nowMs } = deps;
  
  // ---- wave 1 -------------------------------------------------------------
  const [profileRes, openRes, settingsRes] = await Promise.all([
    supabase.from("profiles").select("timezone, primary_track").eq("id", userId).single(),
    supabase
      .from("sessions")
      .select("id, status, local_date, actual_type, started_at")
      .in("status", ["planned", "in_progress", "skipped"])
      .order("local_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_settings").select("resume_session").eq("user_id", userId).maybeSingle(),
  ]);

  const timezone = resolveTimezoneWithProfile(profileRes.data?.timezone);
  const today = localDateString(timezone, new Date(nowMs));
  const resumeEnabled = settingsRes.data?.resume_session ?? true;

  const todayRows = (openRes.data ?? []).filter((s) => s.local_date === today);
  const existing = pickReusableSession(todayRows, resumeEnabled);

  if (existing) {
    const updatePayload = {
      status: "in_progress" as const,
      ...(existing.started_at === null || existing.status === "skipped"
        ? { started_at: new Date(nowMs).toISOString() }
        : {}),
    };

    const [updateResult] = await Promise.all([
      updateSessionCore(supabase, existing.id, userId, today, updatePayload),
      ensureSessionExercises(supabase, userId, existing.id),
    ]);

    if (!updateResult.ok) {
      return { ok: false, error: updateResult.error };
    }

    return { ok: true, sessionId: updateResult.sessionId };
  }

  // Ensure we have a current block before creating a session
  const rolloverResult = await ensureCurrentBlock(supabase, userId, today);
  if (rolloverResult.status === "none") {
    return { ok: false, error: "You have no active training block." };
  }
  if (rolloverResult.status === "error") {
    return { ok: false, error: rolloverResult.error };
  }

  const dayIndex = isoWeekday(today);

  const loadResult = await loadStartProgram(
    createLoadStartProgramDeps(supabase),
    rolloverResult.programId,
    dayIndex
  );
  if (!loadResult.ok) return { ok: false, error: loadResult.error };

  const { program, day } = loadResult;

  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, today);
  const isDeloadWeek = week === program.deload_week;

  // ---- wave 2 -------------------------------------------------------------
  // Case C: Idempotent session start - check for existing in_progress session first
  const { data: existingInProgressSessions } = await supabase
    .from("sessions")
    .select("id, status, local_date, actual_type")
    .eq("user_id", userId)
    .eq("local_date", today)
    .eq("status", "in_progress");

  if (existingInProgressSessions && existingInProgressSessions.length > 0) {
    // An in_progress session already exists for this user + date, return it (idempotent)
    return { ok: true, sessionId: existingInProgressSessions[0].id };
  }

  // L3: Before inserting, close stale sessions from other dates
  const staleDeps = buildStartSessionStaleDeps(supabase, userId, openRes.data ?? [], today, nowMs);
  const staleResult = await startSessionStaleCore(staleDeps);
  if (!staleResult.ok) {
    return { ok: false, error: staleResult.error };
  }

  // If a fresh cross-date session remains (< 6h, timezone shift), resume it
  if (!staleResult.shouldInsert) {
    return { ok: true, sessionId: staleResult.resumeSessionId };
  }

  // No existing in_progress session, create a new one and read the plan
  const [insertResult, plannedRes] = await Promise.all([
    startSessionCore(supabase, userId, {
      user_id: userId,
      program_id: program.id,
      program_day_id: day.id,
      local_date: today,
      week_in_block: week,
      is_deload: isDeloadWeek,
      planned_type: day.day_type,
      actual_type: day.day_type,
      status: "in_progress",
      started_at: new Date(nowMs).toISOString(),
    }),
    supabase
      .from("program_day_exercises")
      .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric)")
      .eq("program_day_id", day.id)
      .order("order_index"),
  ]);

  if (!insertResult.ok) {
    if ("existingSessionId" in insertResult && insertResult.existingSessionId) {
      return { ok: true, sessionId: insertResult.existingSessionId };
    }
    return { ok: false, error: insertResult.error };
  }

  // Insert the session exercises
  const planned = plannedRes.data;
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
        session_id: insertResult.sessionId,
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

    const exerciseInsertResult = await insertSessionExercises(supabase, exercisesToInsert);
    if (!exerciseInsertResult.ok) {
      return { ok: false, error: exerciseInsertResult.error };
    }
  }

  return { ok: true, sessionId: insertResult.sessionId };
}
