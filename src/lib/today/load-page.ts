/**
 * Page loader: assembles query results and calls buildPage.
 * 
 * Extracted from page.tsx to enable testing of the wiring layer
 * without running the full page component.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildPage, type BuildPageInput } from "./build-page";

type DayType = Database["public"]["Enums"]["day_type"];

type SessionExercisesQueryResult = {
  data: Array<{
    session_id: string;
    session_sets: Array<{
      is_warmup_set: boolean;
      reps: number | null;
      duration_seconds: number | null;
    }>;
  }> | null;
  error: Error | null;
};

type SessionExercisesFetcher = (
  sessionIds: string[]
) => Promise<SessionExercisesQueryResult>;

export type LoadPageInput = {
  profile: {
    id: string;
    created_at: string | null;
    timezone: string | null;
  };
  program: {
    id: string;
    started_on: string;
    week_offset: number;
    deload_week: number | null;
  };
  days: Array<{
    id: string;
    day_index: number;
    day_type: DayType;
    label: string | null;
  }> | null;
  hasStartedAnyRes: {
    data: Array<{
      actual_type: DayType | null;
      started_at: string | null;
    }> | null;
    error: Error | null;
  };
  sessionsRes: {
    data: Array<{
      id: string;
      local_date: string;
      status: string;
      actual_type: DayType | null;
      program_id: string | null;
      program_day_id: string | null;
      started_at: string | null;
      created_at: string | null;
    }> | null;
    error: Error | null;
  };
  timezone: string;
  localToday: string;
  yesterday: string;
  fetchSessionExercises: SessionExercisesFetcher;
};

/**
 * Load page state: fetch yesterday's exercise sets, then call buildPage.
 */
export async function loadPage(input: LoadPageInput) {
  const {
    profile,
    program,
    days,
    hasStartedAnyRes,
    sessionsRes,
    timezone,
    localToday,
    yesterday,
    fetchSessionExercises,
  } = input;

  // Fetch session_exercises for yesterday (needed for missed-day detection)
  const allSessions = sessionsRes.data ?? [];
  const yesterdaySessions = allSessions.filter((s) => s.local_date === yesterday);
  const yesterdaySessionIds = yesterdaySessions.map((s) => s.id);

  const sessionExercisesRes =
    yesterdaySessionIds.length > 0
      ? await fetchSessionExercises(yesterdaySessionIds)
      : { data: null, error: null };

  // Build all Today page state using buildPage helper
  const pageResult = buildPage({
    profile: {
      id: profile.id,
      created_at: profile.created_at,
      timezone: profile.timezone,
    },
    program: {
      id: program.id,
      started_on: program.started_on,
      week_offset: program.week_offset,
      deload_week: program.deload_week,
    },
    days: days ?? [],
    allSessionsRes: hasStartedAnyRes,
    todaySessionsRes: sessionsRes,
    yesterdaySessionsRes: sessionsRes,
    sessionExercisesRes,
    timezone,
    localToday,
    yesterday,
  });

  return pageResult;
}

/**
 * Create a Supabase-based session exercises fetcher.
 */
export function createSupabaseSessionExercisesFetcher(
  supabase: SupabaseClient<Database>
): SessionExercisesFetcher {
  return async (sessionIds: string[]) => {
    return await supabase
      .from("session_exercises")
      .select("session_id, session_sets(is_warmup_set, reps, duration_seconds)")
      .in("session_id", sessionIds);
  };
}
