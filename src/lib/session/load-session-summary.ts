/**
 * Load session summary (completed exercises with progression notes).
 *
 * Server action for the session runner to fetch the "What changed for next time"
 * summary from persisted DB data instead of client state.
 *
 * FIX (a): progressNotes client state was lost on remount, so exercises
 * finished before navigation were missing from the summary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildSessionSummary, type SummaryNote } from "./build-session-summary";

type SessionExerciseWithSets = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  planned_sets: number;
  planned_reps_min: number;
  planned_reps_max: number;
  metric: "reps" | "seconds";
  feel: Database["public"]["Enums"]["set_feel"] | null;
  status: "completed" | "skipped";
  completed_at: string | null;
  exercises: {
    mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
    movement_pattern: Database["public"]["Enums"]["movement_pattern"];
    equipment_ids: string[];
    progression_chain: string | null;
    progression_rank: number | null;
  };
  sets: Array<{
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
  }>;
  prior_progress: {
    current_working_weight_kg: number | null;
    current_target_reps: number | null;
    consecutive_failures: number;
    best_weight_kg: number | null;
    best_reps: number | null;
    best_e1rm: number | null;
    total_sessions: number;
  } | null;
};

/**
 * Load the summary from the database for a completed or in-progress session.
 *
 * Fetches all completed exercises with their sets and prior progress state,
 * then re-runs evaluateProgression to generate the same note that
 * finishExercise produced.
 */
export async function loadSessionSummary(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string,
): Promise<SummaryNote[]> {
  // Fetch user's units preference for PB toast formatting
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .eq("id", userId)
    .single();

  const units = profile?.units === "imperial" ? "imperial" : "metric";

  return buildSessionSummary(sessionId, {
    async fetchExercisesWithSets(sessionId: string) {
      const { data: exercises, error: exError } = await supabase
        .from("session_exercises")
        .select(
          "id, exercise_id, exercises!session_exercises_exercise_id_fkey(id, name, mechanic, movement_pattern, equipment_ids, progression_chain, progression_rank), planned_sets, planned_reps_min, planned_reps_max, metric, feel, status, completed_at, session_sets(reps, weight_kg, duration_seconds, is_warmup_set)"
        )
        .eq("session_id", sessionId)
        .in("status", ["completed", "skipped"])
        .order("completed_at");

      if (exError || !exercises) return [];

      // Fetch prior progress for each exercise
      const exerciseIds = exercises
        .map((e) => {
          const ex = e.exercises as unknown as { id: string };
          return ex?.id;
        })
        .filter(Boolean);

      const { data: progress } = await supabase
        .from("exercise_progress")
        .select("*")
        .eq("user_id", userId)
        .in("exercise_id", exerciseIds);

      const progressMap = new Map(
        (progress ?? []).map((p) => [p.exercise_id, p])
      );

      return exercises.map((e): SessionExerciseWithSets => {
        const ex = e.exercises as unknown as {
          id: string;
          name: string;
          mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
          movement_pattern: Database["public"]["Enums"]["movement_pattern"];
          equipment_ids: string[];
          progression_chain: string | null;
          progression_rank: number | null;
        };

        const sets = (e.session_sets ?? []) as Array<{
          reps: number | null;
          weight_kg: number | null;
          duration_seconds: number | null;
          is_warmup_set: boolean;
        }>;

        const prior = progressMap.get(ex?.id ?? "");

        return {
          id: e.id,
          exercise_id: ex?.id ?? "",
          exercise_name: ex?.name ?? "",
          planned_sets: e.planned_sets ?? 3,
          planned_reps_min: e.planned_reps_min ?? 8,
          planned_reps_max: e.planned_reps_max ?? 12,
          metric: e.metric ?? "reps",
          feel: e.feel,
          status: (e.status === "completed" || e.status === "skipped" ? e.status : "completed") as "completed" | "skipped",
          completed_at: e.completed_at,
          exercises: {
            mechanic: ex?.mechanic ?? null,
            movement_pattern: ex?.movement_pattern ?? "squat",
            equipment_ids: ex?.equipment_ids ?? [],
            progression_chain: ex?.progression_chain ?? null,
            progression_rank: ex?.progression_rank ?? null,
          },
          sets: sets
            .filter((s) => !s.is_warmup_set)
            .map((s) => ({
              reps: s.reps,
              weight_kg: typeof s.weight_kg === "number" ? s.weight_kg : (s.weight_kg ? parseFloat(s.weight_kg) : null),
              duration_seconds: s.duration_seconds,
            })),
          prior_progress: prior
            ? {
                current_working_weight_kg: typeof prior.current_working_weight_kg === "number"
                  ? prior.current_working_weight_kg
                  : (prior.current_working_weight_kg ? parseFloat(prior.current_working_weight_kg) : null),
                current_target_reps: prior.current_target_reps,
                consecutive_failures: prior.consecutive_failures,
                best_weight_kg: typeof prior.best_weight_kg === "number"
                  ? prior.best_weight_kg
                  : (prior.best_weight_kg ? parseFloat(prior.best_weight_kg) : null),
                best_reps: prior.best_reps,
                best_e1rm: typeof prior.best_e1rm === "number"
                  ? prior.best_e1rm
                  : (prior.best_e1rm ? parseFloat(prior.best_e1rm) : null),
                total_sessions: prior.total_sessions,
              }
            : null,
        };
      });
    },

    async fetchSession(sessionId: string) {
      const { data: session } = await supabase
        .from("sessions")
        .select("is_deload, local_date")
        .eq("id", sessionId)
        .maybeSingle();

      return session
        ? {
            is_deload: session.is_deload ?? false,
            local_date: session.local_date ?? "",
          }
        : null;
    },
  }, units);
}
