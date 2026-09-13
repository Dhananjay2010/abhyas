import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { selectWarmup, type WarmupRow } from "@/lib/program/warmup";
import { nextDayPlan } from "@/lib/program/day-plan";
import { suggestedWeight } from "@/lib/program/progression";
import type { Database } from "@/lib/database.types";
import { SessionRunner, type RunnerExercise, type RunnerSettings } from "./session-runner";

export const dynamic = "force-dynamic";

type Muscle = Database["public"]["Enums"]["muscle"];

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- one wave -----------------------------------------------------------
  // This screen is opened mid-workout, so its latency is felt more than any
  // other. It used to run six waves of queries one after another: the session,
  // then a batch of six, then the user's progress on each lift (which needed
  // the exercise ids from the batch), then the sets already logged (which
  // needed the session-exercise ids).
  //
  // Both of those dependencies are removed rather than merely parallelised.
  // The sets come back embedded in the session row, so nothing has to learn an
  // id first; and `exercise_progress` is read whole — row-level security scopes
  // it to this user and it holds one small row per lift they have ever trained,
  // so filtering it by the ids in this session bought nothing but a round trip.
  const [sessionRes, settingsRes, profileRes, injuriesRes, warmupsRes, equipmentRes, progressRes] =
    await Promise.all([
      supabase
        .from("sessions")
        // Must be one string literal: Supabase infers row types from it, and a
        // concatenation degrades the result to GenericStringError.
        //
        // `exercises` is disambiguated by constraint name because
        // session_exercises points at it twice — once for the exercise itself
        // and once for what it was swapped from. Without the hint PostgREST
        // answers PGRST201 rather than guessing.
        .select("id, status, local_date, is_deload, week_in_block, warmup_completed, started_at, session_exercises(id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, feel, exercises!session_exercises_exercise_id_fkey(id, name, cue, movement_pattern, metric, primary_muscles, equipment_ids), session_sets(set_number, reps, weight_kg, duration_seconds, is_warmup_set))")
        .eq("id", id)
        .order("order_index", { referencedTable: "session_exercises" })
        .maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      supabase
        .from("profiles")
        .select("primary_track, has_all_equipment, timezone")
        .eq("id", user.id)
        .single(),
      supabase.from("user_injuries").select("body_region"),
      supabase.from("warmup_exercises").select("*").eq("is_active", true),
      supabase.from("user_equipment").select("equipment_id"),
      supabase
        .from("exercise_progress")
        .select("exercise_id, current_working_weight_kg, current_target_reps"),
    ]);

  // A failed query used to fall through to "this session has no exercises",
  // which is indistinguishable from a genuinely empty session. It hid a
  // PGRST201 ambiguous-embed error for the entire life of this page, so a real
  // failure is raised rather than swallowed.
  //
  // The one exception is a route parameter that is not a UUID at all: Postgres
  // rejects it as invalid input (22P02), and the honest answer to "/session/
  // nonsense" is 404, not a server error.
  if (sessionRes.error) {
    if (sessionRes.error.code === "22P02") notFound();
    throw new Error(`Could not load this session: ${sessionRes.error.message}`);
  }

  const session = sessionRes.data;
  if (!session) notFound();
  if (session.status === "completed") redirect("/today");

  const rows = session.session_exercises ?? [];
  const progressByExercise = new Map(
    (progressRes.data ?? []).map((p) => [p.exercise_id, p]),
  );

  const exercises: RunnerExercise[] = rows.map((r) => {
    const ex = r.exercises as unknown as {
      id: string;
      name: string;
      cue: string | null;
      movement_pattern: Database["public"]["Enums"]["movement_pattern"];
      metric: Database["public"]["Enums"]["exercise_metric"];
      primary_muscles: Muscle[];
      equipment_ids: string[];
    };
    const progress = progressByExercise.get(ex?.id ?? "");
    const working =
      progress?.current_working_weight_kg === null || progress === undefined
        ? null
        : Number(progress.current_working_weight_kg);
    return {
      id: r.id,
      exerciseId: ex?.id ?? "",
      name: ex?.name ?? "Exercise",
      cue: ex?.cue ?? null,
      metric: ex?.metric ?? "reps",
      primaryMuscles: ex?.primary_muscles ?? [],
      plannedSets: r.planned_sets ?? 3,
      repsMin: r.planned_reps_min ?? 8,
      repsMax: r.planned_reps_max ?? 12,
      restSeconds: r.rest_seconds ?? 90,
      status: r.status,
      feel: r.feel,
      workingWeightKg: working,
      suggestedWeightKg: suggestedWeight(
        { currentWorkingWeightKg: working },
        session.is_deload,
        {
          mechanic: null,
          movementPattern: ex?.movement_pattern ?? "other",
          metric: ex?.metric ?? "reps",
          isBodyweight: (ex?.equipment_ids ?? []).length === 0,
          progressionChain: null,
          progressionRank: null,
        },
      ),
      // Warm-up sets are excluded and the order applied here rather than in the
      // query. PostgREST is documented to filter an embedded resource without
      // dropping its parent, but if that were ever wrong the failure would be
      // silent and severe: a session that has not been started yet has no
      // logged sets, so every exercise would vanish from the runner. A handful
      // of rows per exercise is not worth taking that on trust.
      sets: (r.session_sets ?? [])
        .filter((set) => !set.is_warmup_set)
        .sort((a, b) => a.set_number - b.set_number)
        .map((set) => ({
          setNumber: set.set_number,
          reps: set.reps,
          weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
          durationSeconds: set.duration_seconds,
        })),
    };
  });

  const trainingMuscles = [...new Set(exercises.flatMap((e) => e.primaryMuscles))];
  const warmup = selectWarmup({
    warmups: (warmupsRes.data ?? []) as WarmupRow[],
    trainingMuscles,
    // Prehab uses past injuries too -- they do not block a movement, but they
    // are exactly what is worth warming up.
    injuryRegions: (injuriesRes.data ?? []).map((i) => i.body_region),
    track: profileRes.data?.primary_track ?? "weights",
    availableEquipment: profileRes.data?.has_all_equipment
      ? null
      : new Set((equipmentRes.data ?? []).map((e) => e.equipment_id)),
  });

  const s = settingsRes.data;
  const settings: RunnerSettings = {
    perSetLogging: s?.per_set_logging ?? true,
    restAutostart: s?.rest_timer_autostart ?? true,
    restSound: s?.rest_timer_sound ?? true,
    restVibrate: s?.rest_timer_vibrate ?? true,
    restOverrideSeconds: s?.rest_seconds_override ?? null,
    cooldownEnabled: s?.cooldown_enabled ?? true,
  };

  // "What about tomorrow?" needs the block's own days to offer as alternatives,
  // and what tomorrow already is. Read after the session itself so a slow
  // answer here can never delay the screen the user is waiting on.
  const tomorrow = await nextDayPlan(supabase, profileRes.data?.timezone ?? "Asia/Kolkata");

  return (
    <SessionRunner
      sessionId={session.id}
      isDeload={session.is_deload}
      week={session.week_in_block ?? 1}
      warmupAlreadyDone={session.warmup_completed}
      startedAt={session.started_at}
      warmup={warmup}
      exercises={exercises}
      settings={settings}
      tomorrow={tomorrow}
    />
  );
}
