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
import type { StartSessionFullDeps, ProgramDayExercise } from "./start-session-full-core";
import { applyBannedCleanup } from "@/lib/program/apply-banned-cleanup";
import type { CandidateExercise } from "@/lib/program/generate";
import { toCandidateExercises } from "@/lib/program/candidate-exercise-guard";
import type { ReplacementResult } from "@/lib/program/replace-banned-in-planned";

/**
 * Apply banned-exercise cleanup for start-session (extracted for M10 test coverage).
 */
type ProfileForCleanup = {
  goal: "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "flexibility_stress";
  level: "beginner" | "intermediate" | "expert";
  primary_track: "weights" | "bodyweight" | "yoga" | "meditation";
  days_per_week: number;
  yoga_days_per_week: number;
  has_all_equipment: boolean;
};

type InjuryForCleanup = {
  body_region: "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle" | "core";
  severity: "current" | "past";
};

export function applyStartSessionCleanup(
  plannedForCleaning: Array<{
    id: string;
    exercise_id: string;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
  }>,
  catalogue: CandidateExercise[],
  profile: ProfileForCleanup,
  injuries: Array<InjuryForCleanup>,
  userId: string,
  equipmentIds: string[]
): ReplacementResult {
  const { replaceBannedInPlanned } = require("@/lib/program/replace-banned-in-planned");
  const { buildInjuryFlags } = require("@/lib/program/injury-regions");
  
  const { currentInjuryRegions, anyKneeInjury } = buildInjuryFlags(injuries);
  
  if (!anyKneeInjury) {
    return { rows: plannedForCleaning, changed: false };
  }
  
  const generatorInput = {
    userId,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week,
    age: null,
    bmi: null,
    hasAllEquipment: profile.has_all_equipment,
    equipmentIds,
    currentInjuryRegions,
    anyKneeInjury,
    catalogue,
  };
  
  return replaceBannedInPlanned(plannedForCleaning, catalogue, generatorInput);
}

export function buildStartSessionFullDeps(
  supabase: SupabaseClient<Database>,
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
      const [catalogueRes, profileRes, injuriesRes, equipmentRes] = await Promise.all([
        supabase.from("exercises").select("id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category").eq("is_active", true),
        supabase.from("profiles").select("goal, level, primary_track, days_per_week, yoga_days_per_week, has_all_equipment").eq("id", userId).maybeSingle(),
        supabase.from("user_injuries").select("body_region, severity").eq("user_id", userId),
        supabase.from("user_equipment").select("equipment_id").eq("user_id", userId),
      ]);

      const catalogue = toCandidateExercises(catalogueRes.data || []);
      const profileData = profileRes.data;
      const injuries = injuriesRes.data || [];
      const equipmentIds = (equipmentRes.data || []).map(e => e.equipment_id);

      const profile = profileData && 
                      profileData.goal && 
                      profileData.level && 
                      profileData.primary_track && 
                      profileData.days_per_week !== null
        ? {
            goal: profileData.goal,
            level: profileData.level,
            primary_track: profileData.primary_track,
            days_per_week: profileData.days_per_week,
            yoga_days_per_week: profileData.yoga_days_per_week,
            has_all_equipment: profileData.has_all_equipment,
          }
        : null;

      await ensureSessionExercises(supabase, userId, sessionId, catalogue, profile, injuries, equipmentIds);
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

    async cleanBannedExercises(exercises) {
      // Load data needed for cleaning
      const [profileRes, injuriesRes, catalogueRes, equipmentRes] = await Promise.all([
        supabase.from("profiles").select("goal, level, primary_track, days_per_week, yoga_days_per_week, has_all_equipment").eq("id", userId).maybeSingle(),
        supabase.from("user_injuries").select("body_region, severity").eq("user_id", userId),
        supabase.from("exercises").select("id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category").eq("is_active", true),
        supabase.from("user_equipment").select("equipment_id").eq("user_id", userId),
      ]);

      const profile = profileRes.data;
      const injuries = injuriesRes.data || [];
      const catalogue = toCandidateExercises(catalogueRes.data);
      const equipmentIds = (equipmentRes.data ?? []).map(r => r.equipment_id);

      if (!profile || !catalogue) {
        return exercises;
      }

      if (!profile.goal || !profile.level || !profile.primary_track ||
          profile.days_per_week === null || profile.days_per_week === undefined ||
          profile.yoga_days_per_week === null || profile.yoga_days_per_week === undefined) {
        return exercises;
      }

      const plannedForCleaning = exercises.map((e, idx) => ({
        id: `pde-${idx}`,
        exercise_id: e.exercise_id,
        order_index: e.order_index,
        target_sets: e.target_sets,
        target_reps_min: e.target_reps_min,
        target_reps_max: e.target_reps_max,
        rest_seconds: e.rest_seconds,
      }));

      const cleaned = applyStartSessionCleanup(
        plannedForCleaning,
        catalogue,
        {
          goal: profile.goal,
          level: profile.level,
          primary_track: profile.primary_track,
          days_per_week: profile.days_per_week,
          yoga_days_per_week: profile.yoga_days_per_week,
          has_all_equipment: profile.has_all_equipment ?? true,
        },
        injuries,
        userId,
        equipmentIds
      );

      const cleanedMap = new Map(cleaned.rows.map(c => [c.id, c.exercise_id]));
      return exercises
        .map((e, idx) => {
          const pdeId = `pde-${idx}`;
          const cleanedExerciseId = cleanedMap.get(pdeId);
          if (cleanedExerciseId === undefined) {
            return null;
          }
          return {
            ...e,
            exercise_id: cleanedExerciseId,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
    },
  };
}
