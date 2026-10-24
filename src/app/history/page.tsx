import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { HistoryClient } from "./history-client";
import type { SessionListItem } from "./types";
import { detectSessionPRs } from "./detect-session-prs";

export const dynamic = "force-dynamic";

type SessionType = "lifts" | "yoga" | "breathing";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const params = await searchParams;
  const filter = (params.filter as SessionType) || "lifts";
  const page = parseInt(params.page || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const profileRes = await supabase
    .from("profiles")
    .select("timezone, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);

  // Build the query based on filter
  let query = supabase
    .from("sessions")
    .select(
      `
      id,
      local_date,
      status,
      actual_type,
      duration_seconds,
      is_deload,
      week_in_block,
      started_at,
      completed_at,
      program_days(label),
      breathing_patterns!sessions_breathing_pattern_id_fkey(name, phases),
      breathing_logs(breaths, routine_name)
    `,
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .lte("local_date", today);

  // Apply filter
  if (filter === "lifts") {
    query = query.in("actual_type", ["weights", "bodyweight"]);
  } else if (filter === "yoga") {
    query = query.eq("actual_type", "yoga");
  } else if (filter === "breathing") {
    query = query.eq("actual_type", "meditation");
  }

  query = query.order("local_date", { ascending: false }).range(offset, offset + limit - 1);

  const { data: sessions, error: sessionsError, count } = await query;

  if (sessionsError) {
    throw new Error(`Could not load your history: ${sessionsError.message}`);
  }

  // Get volume data for strength sessions
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: volumeData } = await supabase
    .from("session_volume")
    .select("session_id, volume_kg, set_count")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  const volumeById = new Map((volumeData ?? []).map((v) => [v.session_id, v]));

  // Get session exercises to find top sets and PRs
  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("id, session_id, exercise_id, metric")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "completed");

  const exercisesBySession = new Map<string, Array<{ id: string; exercise_id: string; metric: string }>>();
  for (const ex of sessionExercises ?? []) {
    const list = exercisesBySession.get(ex.session_id) ?? [];
    list.push(ex);
    exercisesBySession.set(ex.session_id, list);
  }

  // Get all sets for these session_exercises to calculate top sets
  const sessionExerciseIds = (sessionExercises ?? []).map((se) => se.id);
  const { data: allSets } = await supabase
    .from("session_sets")
    .select("session_exercise_id, reps, weight_kg, duration_seconds")
    .in(
      "session_exercise_id",
      sessionExerciseIds.length ? sessionExerciseIds : ["00000000-0000-0000-0000-000000000000"]
    )
    .eq("is_warmup_set", false);

  const setsByExercise = new Map<string, Array<{ reps: number | null; weight_kg: number | null; duration_seconds: number | null }>>();
  for (const set of allSets ?? []) {
    const list = setsByExercise.get(set.session_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.session_exercise_id, list);
  }

  // Get exercise history helpers
  const { findTopSet } = await import("@/lib/exercise-history/calculations");

  // Detect which sessions had PRs at the time
  // Pass the OLDEST session's completed_at so we fetch full prior history
  const oldestCompletedAt = sessions?.[sessions.length - 1]?.completed_at ?? null;
  const sessionsWithPRs = await detectSessionPRs(
    supabase,
    user.id,
    sessionIds,
    oldestCompletedAt
  );

  const items: SessionListItem[] = (sessions ?? []).map((s) => {
    const vol = volumeById.get(s.id);
    const isBreathing = s.actual_type === "meditation";
    const exercises = exercisesBySession.get(s.id) ?? [];

    // Calculate top set weight for strength sessions
    let topSetWeight: number | null = null;

    if (!isBreathing && exercises.length > 0) {
      const topSets = exercises.map((ex) => {
        const sets = setsByExercise.get(ex.id) ?? [];
        if (sets.length === 0) return null;
        const metric = (ex.metric || "reps") as "reps" | "seconds";
        return findTopSet(sets, metric);
      }).filter(Boolean);

      if (topSets.length > 0) {
        topSetWeight = Math.max(...topSets.map((s) => s?.weight_kg ?? 0).filter((w) => w > 0));
        if (topSetWeight === 0) topSetWeight = null;
      }
    }

    // Check if this session had any PRs at the time
    const hasPR = sessionsWithPRs.has(s.id);

    const logs = (s.breathing_logs ?? []) as Array<{
      breaths: number;
      routine_name: string | null;
    }>;
    const routineName = logs.find((l) => l.routine_name)?.routine_name ?? null;
    const pattern = s.breathing_patterns as unknown as
      | { name: string; phases: unknown }
      | null;
    const pumps =
      routineName === null &&
      Array.isArray(pattern?.phases) &&
      pattern.phases.some(
        (p) => typeof p === "object" && p !== null && (p as { kind?: string }).kind === "pump"
      );

    return {
      id: s.id,
      localDate: s.local_date,
      status: s.status,
      actualType: s.actual_type,
      durationSeconds: s.duration_seconds,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      isDeload: s.is_deload,
      programDayLabel: (s.program_days as unknown as { label: string } | null)?.label ?? null,
      setCount: vol?.set_count ?? 0,
      volumeKg: Number(vol?.volume_kg ?? 0),
      topSetWeight,
      hasPR,
      breathing: isBreathing
        ? {
            breaths: logs.length ? logs.reduce((n, l) => n + l.breaths, 0) : null,
            pumps,
            patternName: routineName ?? pattern?.name ?? null,
          }
        : null,
    };
  });

  return (
    <HistoryClient
      items={items}
      filter={filter}
      page={page}
      totalCount={count ?? 0}
      today={today}
      timezone={timezone}
    />
  );
}
