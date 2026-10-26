/**
 * Load the end-of-session summary ("Personal bests" and "What changed for
 * next time") from the database, so it survives a remount or a Resume.
 *
 * NOTE: the diff between what this session prescribed and the post-update
 * exercise_progress row (what is prescribed next time).
 *
 * PB: decided by the same nextBest the progression engine uses at finish time,
 * so the summary and the post-exercise banner never disagree. The prior bests
 * are rebuilt from the user's OTHER sessions' working sets (this session,
 * warm-ups and skipped exercises excluded), never from exercise_progress's
 * best_* columns, which finishExercise has already overwritten with this
 * session's result. A first session has nothing to beat, so it claims nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { describePersonalBest, nextBest, type LoggedSet } from "@/lib/program/progression";
import { getUnitsPreference } from "@/lib/units";

export type SummaryNote = {
  name: string;
  message: string;
  personalBest: string | null;
};

type Metric = Database["public"]["Enums"]["exercise_metric"];

type SetRow = {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean;
};

type HistoryRow = SetRow & {
  session_exercises:
    | { exercise_id: string; session_id: string; status: string; metric: Metric }
    | Array<{ exercise_id: string; session_id: string; status: string; metric: Metric }>
    | null;
};

/** PostgREST caps a response at 1000 rows, so history is read in pages. */
export const HISTORY_PAGE_SIZE = 1000;

const toLogged = (s: SetRow): LoggedSet => ({
  reps: s.reps,
  weightKg: s.weight_kg,
  durationSeconds: s.duration_seconds,
});

export async function loadSessionSummary(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string,
): Promise<SummaryNote[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .eq("id", userId)
    .single();

  const units = getUnitsPreference(profile?.units);

  // This session's completed exercises with their sets.
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select(
      `id, exercise_id, order_index,
       exercises!session_exercises_exercise_id_fkey(name, mechanic, movement_pattern),
       planned_sets, planned_reps_min, planned_reps_max, metric, feel, status,
       session_sets(reps, weight_kg, duration_seconds, is_warmup_set)`
    )
    .eq("session_id", sessionId)
    .in("status", ["completed"])
    .order("order_index");

  if (!exercises || exercises.length === 0) return [];

  const exerciseIds = exercises.map((e) => e.exercise_id).filter(Boolean);

  // Post-update exercise_progress: what is prescribed next time.
  const { data: progressRows } = await supabase
    .from("exercise_progress")
    .select("exercise_id, current_working_weight_kg, current_target_reps")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);

  const progressMap = new Map((progressRows ?? []).map((p) => [p.exercise_id, p]));

  // Working sets from the user's other completed exercises, paged in a stable
  // order so no row is skipped or read twice across pages.
  const history: HistoryRow[] = [];
  for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("session_sets")
      .select(
        `id, reps, weight_kg, duration_seconds, is_warmup_set,
         session_exercises!inner(exercise_id, session_id, status, metric)`
      )
      .eq("user_id", userId)
      .eq("is_warmup_set", false)
      .in("session_exercises.exercise_id", exerciseIds)
      .neq("session_exercises.session_id", sessionId)
      .eq("session_exercises.status", "completed")
      .order("id")
      .range(offset, offset + HISTORY_PAGE_SIZE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;
    history.push(...(page as unknown as HistoryRow[]));
    if (page.length < HISTORY_PAGE_SIZE) break;
  }

  // Group by exercise and metric: a hold's seconds are not comparable to reps.
  const historyByKey = new Map<string, LoggedSet[]>();
  for (const set of history) {
    const se = Array.isArray(set.session_exercises) ? set.session_exercises[0] : set.session_exercises;
    if (!se) continue;
    const key = `${se.exercise_id}:${se.metric}`;
    const list = historyByKey.get(key) ?? [];
    list.push(toLogged(set));
    historyByKey.set(key, list);
  }

  const notes: SummaryNote[] = [];

  for (const ex of exercises) {
    const exerciseName = (ex.exercises as unknown as { name?: string } | null)?.name ?? "";
    const sets = (ex.session_sets ?? []) as SetRow[];
    const workingSets = sets.filter((s) => !s.is_warmup_set);
    if (workingSets.length === 0) continue;

    const progress = progressMap.get(ex.exercise_id);
    if (!progress) continue;

    // NOTE: this session's prescription vs post-update progress.
    const thisSessionWeight = workingSets[0]?.weight_kg ?? null;
    const nextWeight = progress.current_working_weight_kg;
    const thisSessionReps = ex.planned_reps_max ?? 12;
    const nextReps = progress.current_target_reps ?? 12;

    let message: string;
    if (nextWeight !== null && thisSessionWeight !== null && Math.abs(nextWeight - thisSessionWeight) >= 0.01) {
      message = nextWeight > thisSessionWeight ? "Weight up next time" : "Weight down next time";
    } else if (nextReps !== thisSessionReps) {
      message = nextReps > thisSessionReps ? "Reps target up next time" : "Reps target down next time";
    } else {
      message = "Held";
    }

    // PB: the engine's own rule against bests rebuilt from earlier sessions.
    const meta = { metric: ex.metric };
    const prior = nextBest(historyByKey.get(`${ex.exercise_id}:${ex.metric}`) ?? [], {
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
    }, meta);
    const { personalBest } = nextBest(workingSets.map(toLogged), prior, meta);

    notes.push({
      name: exerciseName,
      message,
      personalBest: personalBest ? describePersonalBest(personalBest, units) : null,
    });
  }

  return notes;
}
