import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { getUnitsPreference } from "@/lib/units";
import { HistoryClient } from "./history-client";
import type { SessionListItem } from "./types";
import { detectSessionPRs } from "./detect-session-prs";
import type { PostgrestError } from "@supabase/supabase-js";

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
    .select("timezone, onboarding_completed_at, units")
    .eq("id", user.id)
    .single();

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);
  const units = getUnitsPreference(profile.units);

  // Get the correct count using RPC (excludes zero-set strength and skipped sessions)
  // Pass today as a date (YYYY-MM-DD string is coerced to date by PostgREST)
  // @ts-expect-error - RPC function not in generated types yet
  const { data: countData } = await supabase.rpc("get_history_count", {
    p_user: user.id,
    p_filter: filter,
    p_today: today, // ISO date string, PostgREST converts to date type
  });
  const count = Number(countData ?? 0);

  // Build the query based on filter
  // For lifts, we need to join with session_volume to exclude zero-set sessions at SQL level
  // For other filters, we can query sessions directly
  type SessionQueryResult = {
    id: string;
    local_date: string;
    status: string;
    actual_type: string | null;
    duration_seconds: number | null;
    started_at: string | null;
    completed_at: string | null;
    is_deload: boolean;
    week_in_block: number | null;
    program_days: { label: string | null } | null;
    breathing_patterns: { name: string; phases: unknown } | null;
    breathing_logs: Array<{ breaths: number; routine_name: string | null }>;
  };
  let sessions: SessionQueryResult[] | null = null;
  let sessionsError: PostgrestError | null = null;

  if (filter === "lifts") {
    // For strength: use session_volume which already excludes zero-set sessions
    // Join back to sessions to get full data
    const { data: volumeSessions, error } = await supabase
      .from("session_volume")
      .select(`
        session_id,
        sessions!inner(
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
        )
      `)
      .eq("user_id", user.id)
      .lte("sessions.local_date", today)
      .neq("sessions.status", "skipped")
      .or(`sessions.status.eq.completed,and(sessions.status.eq.in_progress,sessions.local_date.eq.${today})`)
      .order("sessions.local_date", { ascending: false, referencedTable: "sessions" })
      .order("sessions.completed_at", { ascending: false, nullsFirst: false, referencedTable: "sessions" })
      .order("sessions.started_at", { ascending: false, nullsFirst: false, referencedTable: "sessions" })
      .order("sessions.id", { ascending: false, referencedTable: "sessions" })
      .range(offset, offset + limit - 1);

    sessionsError = error;
    // Extract the nested sessions data
    sessions = volumeSessions?.map((v: { sessions: SessionQueryResult }) => v.sessions) ?? null;
  } else {
    // For yoga/breathing: query sessions directly (no zero-set filtering needed)
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
      `
      )
      .eq("user_id", user.id)
      .lte("local_date", today)
      .neq("status", "skipped")
      .or(`status.eq.completed,and(status.eq.in_progress,local_date.eq.${today})`);

    if (filter === "yoga") {
      query = query.eq("actual_type", "yoga");
    } else if (filter === "breathing") {
      query = query.eq("actual_type", "meditation");
    }

    query = query
      .order("local_date", { ascending: false })
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    const result = await query;
    sessions = result.data;
    sessionsError = result.error;
  }

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

  // Get session exercises to find top sets and PRs, and to calculate planned sets
  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("id, session_id, exercise_id, metric, planned_sets")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "completed");

  const exercisesBySession = new Map<string, Array<{ id: string; exercise_id: string; metric: string }>>();
  const plannedSetsBySession = new Map<string, number>();
  
  for (const ex of sessionExercises ?? []) {
    const list = exercisesBySession.get(ex.session_id) ?? [];
    list.push({ id: ex.id, exercise_id: ex.exercise_id, metric: ex.metric ?? "reps" });
    exercisesBySession.set(ex.session_id, list);
    
    // Sum planned_sets to get total planned sets for this session
    if (ex.planned_sets && ex.planned_sets > 0) {
      plannedSetsBySession.set(
        ex.session_id,
        (plannedSetsBySession.get(ex.session_id) ?? 0) + ex.planned_sets
      );
    }
  }

  // Detect which sessions had PRs at the time AND get set counts
  // This fetches all historical data needed for PR detection and reuses it for counting
  // Pass the OLDEST session's completed_at so we fetch full prior history
  const oldestCompletedAt = sessions?.[sessions.length - 1]?.completed_at ?? null;
  const { sessionsWithPRs, setCountsBySession } = await detectSessionPRs(
    supabase,
    user.id,
    sessionIds,
    oldestCompletedAt
  );

  // Get all sets for these session_exercises to calculate top sets only
  // (set counts already computed by detectSessionPRs above)
  const sessionExerciseIds = (sessionExercises ?? []).map((se) => se.id);
  const allSets: Array<{ session_exercise_id: string; reps: number | null; weight_kg: number | null; duration_seconds: number | null; is_warmup_set: boolean | null }> = [];
  const chunkSize = 100;
  
  for (let i = 0; i < sessionExerciseIds.length; i += chunkSize) {
    const chunk = sessionExerciseIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from("session_sets")
      .select("session_exercise_id, reps, weight_kg, duration_seconds, is_warmup_set")
      .in("session_exercise_id", chunk)
      .eq("is_warmup_set", false);  // Only need working sets for top set calculation
    if (data) allSets.push(...data);
  }

  const setsByExercise = new Map<string, Array<{ reps: number | null; weight_kg: number | null; duration_seconds: number | null; is_warmup_set: boolean | null }>>();
  for (const set of allSets) {
    const list = setsByExercise.get(set.session_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.session_exercise_id, list);
  }

  // Get exercise history helpers
  const { findTopSet } = await import("@/lib/exercise-history/calculations");

  const items: SessionListItem[] = (sessions ?? [])
    .map((s) => {
      const vol = volumeById.get(s.id);
      const isBreathing = s.actual_type === "meditation";
      const exercises = exercisesBySession.get(s.id) ?? [];

      // Get working set count from detectSessionPRs (already computed)
      const workingSetCount = setCountsBySession.get(s.id) ?? 0;

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

    const plannedSets = plannedSetsBySession.get(s.id);
    const endedEarly = 
      plannedSets !== undefined && 
      plannedSets > 0 && 
      workingSetCount < plannedSets;

    return {
      id: s.id,
      localDate: s.local_date,
      status: s.status,
      actualType: s.actual_type,
      durationSeconds: s.duration_seconds,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      isDeload: s.is_deload,
      endedEarly,
      plannedSets: plannedSets ?? null,
      programDayLabel: (s.program_days as unknown as { label: string } | null)?.label ?? null,
      setCount: workingSetCount,
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
  // For lifts, filtering already happened at SQL level via session_volume join
  // For yoga/breathing, no filtering needed (they don't have zero-set issues)

  return (
    <HistoryClient
      items={items}
      filter={filter}
      page={page}
      totalCount={count}
      today={today}
      timezone={timezone}
      units={units}
    />
  );
}
