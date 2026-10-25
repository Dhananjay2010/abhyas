/**
 * Build the "What changed for next time" summary from persisted DB data.
 *
 * FIX (a): The summary was built from client state (progressNotes), which was
 * lost when the user navigated away and tapped Resume. This rebuilds it from
 * session_exercises, session_sets, and exercise_progress, so it's complete
 * after any remount or reload.
 *
 * Each finished exercise shows the same note it got at finish time. The note
 * is derived from evaluateProgression, which finishExercise already called and
 * wrote to exercise_progress. We re-run evaluateProgression with the same
 * inputs to reproduce the exact message.
 */

import type { Database } from "@/lib/database.types";
import { evaluateProgression } from "@/lib/program/progression";
import { buildProgressionInput } from "./build-progression-input";
import { describePersonalBest } from "@/lib/program/progression";

type SetFeel = Database["public"]["Enums"]["set_feel"];
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type SummaryNote = {
  name: string;
  message: string;
  personalBest: string | null;
};

export interface BuildSummaryDeps {
  /**
   * Fetch completed/skipped exercises for this session with their sets and
   * prior progress state. Returns exercises in the order they were completed.
   */
  fetchExercisesWithSets: (sessionId: string) => Promise<Array<{
    id: string;
    exercise_id: string;
    exercise_name: string;
    planned_sets: number;
    planned_reps_min: number;
    planned_reps_max: number;
    metric: "reps" | "seconds";
    feel: SetFeel | null;
    status: "completed" | "skipped";
    completed_at: string | null;
    exercises: {
      mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
      movement_pattern: MovementPattern;
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
  }>>;

  fetchSession: (sessionId: string) => Promise<{
    is_deload: boolean;
    local_date: string;
  } | null>;
}

/**
 * Build the summary from the database, independent of client state.
 *
 * Only includes exercises that were completed (not skipped), and only those
 * where per_set_logging was on (we have numbers to reason about).
 */
export async function buildSessionSummary(
  sessionId: string,
  deps: BuildSummaryDeps,
): Promise<SummaryNote[]> {
  const [exercises, session] = await Promise.all([
    deps.fetchExercisesWithSets(sessionId),
    deps.fetchSession(sessionId),
  ]);

  if (!session) return [];

  const notes: SummaryNote[] = [];

  for (const ex of exercises) {
    // Skip exercises with no sets (skipped or per_set_logging off)
    if (ex.status === "skipped" || ex.sets.length === 0) continue;

    const decision = evaluateProgression(
      buildProgressionInput(
        {
          id: ex.id,
          session_id: sessionId,
          exercise_id: ex.exercise_id,
          planned_sets: ex.planned_sets,
          planned_reps_min: ex.planned_reps_min,
          planned_reps_max: ex.planned_reps_max,
          metric: ex.metric,
          exercises: ex.exercises,
        },
        ex.sets,
        // Default to empty progress state if no prior progress exists
        ex.prior_progress ?? {
          current_working_weight_kg: null,
          current_target_reps: null,
          consecutive_failures: 0,
          best_weight_kg: null,
          best_reps: null,
          best_e1rm: null,
          total_sessions: 0,
        },
        {
          is_deload: session.is_deload,
          local_date: session.local_date,
          program_id: null,
        },
        ex.feel,
      ),
    );

    // No note for no_data (matches finishExercise behavior when per_set_logging is off)
    if (decision.outcome === "no_data") continue;

    notes.push({
      name: ex.exercise_name,
      message: decision.message,
      personalBest: decision.personalBest ? describePersonalBest(decision.personalBest) : null,
    });
  }

  return notes;
}
