/**
 * Builder for startSessionFullCore dependencies from a Supabase client.
 * This bridges the testable core with the real database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { loadStartProgram, createSupabaseDeps as createLoadStartProgramDeps } from "./load-start-program";
import { resolveTodayProgramDay } from "@/lib/program/day-plan";
import { startSessionCore } from "./start-session-core";
import { updateSessionCore } from "./update-session-core";
import { ensureSessionExercises } from "./ensure-session-exercises";
import { insertSessionExercises } from "./insert-session-exercises";
import { buildStartSessionStaleDeps } from "./build-start-session-stale-deps";
import type { StartSessionFullDeps } from "./start-session-full-core";

/**
 * Minimal Supabase client interface for building start session dependencies.
 * Allows testing with structural fakes without full SupabaseClient implementation.
 */
export interface MinimalSupabaseClient {
  from: SupabaseClient<Database>["from"];
}

export function buildStartSessionFullDeps(
  supabase: MinimalSupabaseClient,
  userId: string,
  nowMs: number
): StartSessionFullDeps {
  return {
    userId,
    nowMs,

    async fetchProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .single();
      return data;
    },

    async fetchOpenSessions() {
      const { data } = await supabase
        .from("sessions")
        .select("id, status, local_date, actual_type, started_at")
        .in("status", ["planned", "in_progress", "skipped"])
        .order("local_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      return (data || []).map((s) => ({
        id: s.id,
        status: s.status,
        local_date: s.local_date,
        actual_type: s.actual_type,
        started_at: s.started_at,
      }));
    },

    async fetchResumeEnabled() {
      const { data } = await supabase
        .from("user_settings")
        .select("resume_session")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.resume_session ?? true;
    },

    async updateSession(sessionId, today, payload) {
      const result = await updateSessionCore(supabase, sessionId, userId, today, {
        status: payload.status,
        ...(payload.started_at ? { started_at: payload.started_at } : {}),
      });
      return result;
    },

    async ensureSessionExercises(sessionId) {
      await ensureSessionExercises(supabase, userId, sessionId);
    },

    async ensureCurrentBlock(today) {
      return await ensureCurrentBlock(supabase, userId, today);
    },

    async resolveTodayDay(programId, today) {
      const result = await resolveTodayProgramDay({
        supabase,
        programId,
        localToday: today,
        userId,
      });
      return result;
    },

    async loadProgram(programId, dayIndex) {
      const result = await loadStartProgram(
        createLoadStartProgramDeps(supabase),
        programId,
        dayIndex
      );
      if (!result.ok) return result;
      return {
        ok: true,
        program: result.program,
        dayId: result.day.id,
        dayType: result.day.day_type,
      };
    },

    async loadProgramDay(programId, programDayId) {
      // Load program and find the specific day by ID
      const { data: program, error } = await supabase
        .from("programs")
        .select("id, started_on, deload_week, week_offset, program_days(id, day_index, day_type, focus, label)")
        .eq("program_days.status", "active")
        .eq("id", programId)
        .maybeSingle();
      
      if (error || !program) {
        return { ok: false, error: "Could not load the training block." };
      }
      
      const day = program.program_days.find((d: { id: string }) => d.id === programDayId);
      
      if (!day) {
        return { ok: false, error: "No plan for today." };
      }
      
      return {
        ok: true,
        program,
        dayId: day.id,
        dayType: day.day_type,
      };
    },

    async findInProgressToday(today) {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("local_date", today)
        .eq("status", "in_progress");
      return data || [];
    },

    buildStaleDeps(openSessions, today, nowMs) {
      return buildStartSessionStaleDeps(supabase, userId, openSessions, today, nowMs);
    },

    async insertSession(payload) {
      return await startSessionCore(supabase, userId, payload);
    },

    async fetchPlannedExercises(dayId) {
      const { data } = await supabase
        .from("program_day_exercises")
        .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric)")
        .eq("program_day_id", dayId)
        .order("order_index");
      return data;
    },

    async insertExercises(exercises) {
      const mapped = exercises.map((e) => ({
        session_id: e.session_id,
        user_id: e.user_id,
        exercise_id: e.exercise_id,
        order_index: e.order_index,
        planned_sets: e.planned_sets,
        planned_reps_min: e.planned_reps_min,
        planned_reps_max: e.planned_reps_max,
        rest_seconds: e.rest_seconds,
        metric: e.metric,
      }));
      return await insertSessionExercises(supabase, mapped);
    },
  };
}
