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

  const profileRes = await supabase
    .from("profiles")
    .select("timezone, onboarding_completed_at, units, primary_track")
    .eq("id", user.id)
    .single();

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);
  const units = getUnitsPreference(profile.units);

  // Default filter based on member's primary track (QA M-4)
  const { getDefaultFilter } = await import("@/lib/history/default-filter");
  const defaultFilter = getDefaultFilter(profile.primary_track);
  const filter = (params.filter as SessionType) || defaultFilter;
  
  const limit = 20;

  // Fetch per-tab counts for empty state logic (K1)
  const tabs = ["lifts", "yoga", "breathing"] as const;
  const countRes = await Promise.all(
    tabs.map(f => 
      // @ts-expect-error - RPC function not in generated types yet
      supabase.rpc("get_history_page", {
        p_user: user.id,
        p_filter: f,
        p_today: today,
        p_limit: 1,
        p_offset: 0,
      })
    )
  );
  const countsByFilter = Object.fromEntries(
    tabs.map((f, i) => [
      f,
      Number((countRes[i].data as { total_count: number }[] | null)?.[0]?.total_count ?? 0)
    ])
  ) as Record<SessionType, number>;
  const countsError = countRes.some(r => r.error);

  // Load history page with pagination (fix: fetch with correct offset)
  const { loadHistoryPage } = await import("@/lib/history/load-history-page");
  const historyResult = await loadHistoryPage(supabase, {
    userId: user.id,
    filter,
    today,
    limit,
    pageParam: params.page,
  });

  if (historyResult.error) {
    console.error("Failed to load history page:", historyResult.error);
  }

  const { sessionIds, totalCount: count, page, totalPages } = historyResult;
  const finalPageError = historyResult.error ? new Error(historyResult.error) : null;

  // Fetch session details for the IDs returned by RPC
  const { data: sessions, error: sessionsError } = await supabase
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
    .in("id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (sessionsError) {
    console.error("Failed to load session details:", sessionsError);
  }

  // Re-sort sessions in JS to match RPC order
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const orderedSessions = sessionIds.map((id) => sessionById.get(id)).filter(Boolean) as typeof sessions;

  // Get volume data for strength sessions (QA Bot 3 M3: handle errors silently)
  const { data: volumeData, error: volumeError } = await supabase
    .from("session_volume")
    .select("session_id, volume_kg, set_count")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (volumeError) {
    console.error("Failed to load session volume:", volumeError);
  }

  const volumeById = new Map((volumeData ?? []).map((v) => [v.session_id, v]));

  // Get session exercises to find top sets and PRs, and to calculate planned sets (QA Bot 3 M3: handle errors silently)
  const { data: sessionExercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id, session_id, exercise_id, metric, planned_sets, status")
    .in("session_id", sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (exercisesError) {
    console.error("Failed to load session exercises:", exercisesError);
  }

  const exercisesBySession = new Map<string, Array<{ id: string; exercise_id: string; metric: string }>>();
  const plannedSetsBySession = new Map<string, number>();
  const hasPendingExerciseBySession = new Map<string, boolean>();
  
  for (const ex of sessionExercises ?? []) {
    // Only add completed exercises for top set calculation
    if (ex.status === "completed") {
      const list = exercisesBySession.get(ex.session_id) ?? [];
      list.push({ id: ex.id, exercise_id: ex.exercise_id, metric: ex.metric ?? "reps" });
      exercisesBySession.set(ex.session_id, list);
    }
    
    // Sum planned_sets only over 'pending' or 'completed' exercises (exclude 'skipped' and 'swapped_out')
    if ((ex.status === "pending" || ex.status === "completed") && ex.planned_sets && ex.planned_sets > 0) {
      plannedSetsBySession.set(
        ex.session_id,
        (plannedSetsBySession.get(ex.session_id) ?? 0) + ex.planned_sets
      );
    }
    
    // Track if any exercise is still pending
    if (ex.status === "pending") {
      hasPendingExerciseBySession.set(ex.session_id, true);
    }
  }

  // Detect which sessions had PRs at the time AND get set counts
  // This fetches all historical data needed for PR detection and reuses it for counting
  // Pass the OLDEST session's completed_at so we fetch full prior history
  const oldestCompletedAt = orderedSessions?.[orderedSessions.length - 1]?.completed_at ?? null;
  const { sessionsWithPRs, setCountsBySession } = await detectSessionPRs(
    supabase,
    user.id,
    sessionIds,
    oldestCompletedAt
  );

  // Get all sets for these session_exercises to calculate top sets only
  // (set counts already computed by detectSessionPRs above)
  // QA Bot 3 M3: handle errors silently
  const sessionExerciseIds = (sessionExercises ?? []).map((se) => se.id);
  const allSets: Array<{ session_exercise_id: string; reps: number | null; weight_kg: number | null; duration_seconds: number | null; is_warmup_set: boolean | null }> = [];
  const chunkSize = 100;
  let setsError = null;
  
  for (let i = 0; i < sessionExerciseIds.length; i += chunkSize) {
    const chunk = sessionExerciseIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("session_sets")
      .select("session_exercise_id, reps, weight_kg, duration_seconds, is_warmup_set")
      .in("session_exercise_id", chunk)
      .eq("is_warmup_set", false);  // Only need working sets for top set calculation
    if (error) {
      setsError = error;
      console.error("Failed to load session sets:", error);
    }
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
  const { pickTopSet } = await import("@/lib/history/pick-top-set");

  const items: SessionListItem[] = (orderedSessions ?? [])
    .map((s) => {
      const vol = volumeById.get(s.id);
      const isBreathing = s.actual_type === "meditation";
      const exercises = exercisesBySession.get(s.id) ?? [];

      // Get working set count from detectSessionPRs (already computed)
      const workingSetCount = setCountsBySession.get(s.id) ?? 0;

      // Calculate top set weight for strength sessions
    // Use pickTopSet to find the heaviest working set across all exercises
    let topSetWeight: number | null = null;

    if (!isBreathing && exercises.length > 0) {
      // Collect all working sets from all exercises in this session
      const allSets = exercises.flatMap((ex) => setsByExercise.get(ex.id) ?? []);
      topSetWeight = pickTopSet(allSets);
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
    const hasPendingExercise = hasPendingExerciseBySession.get(s.id) ?? false;
    const hasNoExercises = exercises.length === 0;
    
    // Restore main's original inline logic for History (byte-identical behavior for all statuses)
    const isStrength = !isBreathing && s.actual_type !== "yoga";
    const endedEarly = 
      (hasPendingExercise && 
       plannedSets !== undefined && 
       plannedSets > 0 && 
       workingSetCount < plannedSets) ||
      (isStrength && s.status === "completed" && workingSetCount === 0 && (hasPendingExercise || hasNoExercises));

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

  // Collect error flags (QA Bot 3 M3)
  const hasErrors = !!(countsError || finalPageError || sessionsError || volumeError || exercisesError || setsError);

  return (
    <HistoryClient
      items={items}
      filter={filter}
      page={page}
      totalCount={count}
      today={today}
      timezone={timezone}
      units={units}
      hasErrors={hasErrors}
      countsByFilter={countsByFilter}
    />
  );
}
