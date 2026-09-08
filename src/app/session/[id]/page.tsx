import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectWarmup, type WarmupRow } from "@/lib/program/warmup";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, local_date, is_deload, week_in_block, warmup_completed, started_at")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();
  if (session.status === "completed") redirect("/today");

  const [exercisesRes, settingsRes, profileRes, injuriesRes, warmupsRes, equipmentRes] =
    await Promise.all([
      supabase
        .from("session_exercises")
        // Must be one string literal: Supabase infers row types from it, and a
        // concatenation degrades the result to GenericStringError.
        .select("id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, feel, exercises(id, name, cue, movement_pattern, primary_muscles, equipment_ids)")
        .eq("session_id", id)
        .order("order_index"),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      supabase.from("profiles").select("primary_track, has_all_equipment").eq("id", user.id).single(),
      supabase.from("user_injuries").select("body_region"),
      supabase.from("warmup_exercises").select("*").eq("is_active", true),
      supabase.from("user_equipment").select("equipment_id"),
    ]);

  const rows = exercisesRes.data ?? [];

  // Sets already logged, so a resumed session picks up where it stopped.
  const { data: loggedSets } = await supabase
    .from("session_sets")
    .select("session_exercise_id, set_number, reps, weight_kg")
    .in("session_exercise_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_warmup_set", false)
    .order("set_number");

  const exercises: RunnerExercise[] = rows.map((r) => {
    const ex = r.exercises as unknown as {
      id: string;
      name: string;
      cue: string | null;
      movement_pattern: string;
      primary_muscles: Muscle[];
    };
    return {
      id: r.id,
      exerciseId: ex?.id ?? "",
      name: ex?.name ?? "Exercise",
      cue: ex?.cue ?? null,
      primaryMuscles: ex?.primary_muscles ?? [],
      plannedSets: r.planned_sets ?? 3,
      repsMin: r.planned_reps_min ?? 8,
      repsMax: r.planned_reps_max ?? 12,
      restSeconds: r.rest_seconds ?? 90,
      status: r.status,
      feel: r.feel,
      sets: (loggedSets ?? [])
        .filter((s) => s.session_exercise_id === r.id)
        .map((s) => ({
          setNumber: s.set_number,
          reps: s.reps,
          weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
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
    />
  );
}
