import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { selectWarmup, selectCooldown, type WarmupRow } from "@/lib/program/warmup";
import { nextDayPlan } from "@/lib/program/day-plan";
import { suggestedWeight } from "@/lib/program/progression";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import type { Database } from "@/lib/database.types";
import { SessionRunner, type RunnerExercise, type RunnerSettings } from "./session-runner";
import { getSessionRunnerUserId } from "./session-page-props";
import { isUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";

type Muscle = Database["public"]["Enums"]["muscle"];

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  if (!isUuid(id)) notFound();
  
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
        .select("id, status, local_date, is_deload, week_in_block, warmup_completed, started_at, session_exercises(id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, feel, metric, exercises!session_exercises_exercise_id_fkey(id, name, cue, movement_pattern, primary_muscles, equipment_ids), session_sets(set_number, reps, weight_kg, duration_seconds, is_warmup_set, completed_at))")
        .eq("id", id)
        .order("order_index", { referencedTable: "session_exercises" })
        .maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      supabase
        .from("profiles")
        .select("primary_track, has_all_equipment, timezone")
        .eq("id", user.id)
        .single(),
      supabase.from("user_injuries").select("body_region, severity"),
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

  /*
    Daily menu means no working-weight memory.

    SPEC section 6 says so, and Settings says it to the user's face -- "A
    sensible session each day, with no weight memory" -- but the only thing the
    mode actually did was stop `applyProgression` running. The weights it had
    already remembered were still read here, still printed as "Working weight
    60 kg" above the exercise, and still prefilled into the box. The mode kept
    the memory it promises not to.

    History is untouched, which is the other half of the promise: switching back
    to progression resumes from the last known weights, because they were never
    deleted -- only ignored while the user asked for them to be.
  */
  const remembersWeights = settingsRes.data?.planning_mode !== "daily_menu";

  const exercises: RunnerExercise[] = rows.map((r) => {
    const ex = r.exercises as unknown as {
      id: string;
      name: string;
      cue: string | null;
      movement_pattern: Database["public"]["Enums"]["movement_pattern"];
      primary_muscles: Muscle[];
      equipment_ids: string[];
    };
    const progress = remembersWeights ? progressByExercise.get(ex?.id ?? "") : undefined;
    const working =
      progress?.current_working_weight_kg === null || progress === undefined
        ? null
        : Number(progress.current_working_weight_kg);
    const isBodyweight = (ex?.equipment_ids ?? []).length === 0;
    return {
      id: r.id,
      exerciseId: ex?.id ?? "",
      name: ex?.name ?? "Exercise",
      cue: ex?.cue ?? null,
      /*
        The session's own unit, not the catalogue's. A session resumed after the
        exercise was re-tagged must keep running in the unit its sets were
        logged in, or half the sets in one exercise would be reps and half
        seconds.
      */
      metric: r.metric ?? "reps",
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
          metric: r.metric ?? "reps",
          isBodyweight,
          progressionChain: null,
          progressionRank: null,
        },
      ),
      isBodyweight,
      // Warm-up sets are excluded and the order applied here rather than in the
      // query. PostgREST is documented to filter an embedded resource without
      // dropping its parent, but if that were ever wrong the failure would be
      // silent and severe: a session that has not been started yet has no
      // logged sets, so every exercise would vanish from the runner. A handful
      // of rows per exercise is not worth taking that on trust.
      // Where a resume should land (B1): the latest working set says which
      // exercise the user was in the middle of.
      lastLoggedAt: (r.session_sets ?? [])
        .filter((set) => !set.is_warmup_set)
        .reduce<string | null>((latest, set) => (latest === null || set.completed_at > latest ? set.completed_at : latest), null),
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
  const allWarmupRows = (warmupsRes.data ?? []) as WarmupRow[];
  
  // Separate current and past injuries: prehab uses ALL (past injuries benefit from warming up),
  // but exclusion logic (mobility filter and cool-down) uses only CURRENT to avoid over-filtering
  const allInjuries = injuriesRes.data ?? [];
  const allInjuryRegions = allInjuries.map((i) => i.body_region);
  const currentInjuryRegions = allInjuries.filter((i) => i.severity === "current").map((i) => i.body_region);
  
  const warmup = selectWarmup({
    warmups: allWarmupRows,
    trainingMuscles,
    injuryRegions: currentInjuryRegions,
    prehabRegions: allInjuryRegions,
    track: profileRes.data?.primary_track ?? "weights",
    hasAllEquipment: profileRes.data?.has_all_equipment ?? false,
    availableEquipment: profileRes.data?.has_all_equipment
      ? null
      : new Set((equipmentRes.data ?? []).map((e) => e.equipment_id)),
  });

  // Cool-down uses only CURRENT injuries for exclusion
  const cooldown = selectCooldown({
    stretches: allWarmupRows,
    trainingMuscles,
    injuryRegions: currentInjuryRegions,
    hasAllEquipment: profileRes.data?.has_all_equipment ?? false,
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
  const tomorrow = await nextDayPlan(supabase, resolveTimezoneWithProfile(profileRes.data?.timezone));

  return (
    <SessionRunner
      sessionId={session.id}
      sessionStatus={session.status}
      userId={getSessionRunnerUserId(user)}
      isDeload={session.is_deload}
      week={session.week_in_block ?? 1}
      warmupAlreadyDone={session.warmup_completed}
      startedAt={session.started_at}
      warmup={warmup}
      cooldown={cooldown}
      exercises={exercises}
      settings={settings}
      tomorrow={tomorrow}
    />
  );
}
