/**
 * Today page loader: fetches open sessions, closes stale ones, reads recent sessions,
 * and prepares view state. Tested with typed deps to ensure correct ordering.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SessionForDetection } from "./session-detection";
import { findOpenStrengthSession, creditedBannerText } from "./session-detection";
import { closeStaleSessions } from "@/lib/session/close-stale";

export type OpenSessionRow = {
  id: string;
  local_date: string;
  started_at: string | null;
  actual_type: string | null;
  status: string;
};

export type RecentSessionRow = {
  id: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  local_date: string;
  program_day_id: string | null;
  started_at: string | null;
  created_at: string;
};

export type TodayLoaderDeps = {
  fetchOpenSessions(): PromiseLike<OpenSessionRow[] | null>;
  closeStale(input: OpenSessionRow[], today: string): Promise<number>;
  fetchRecentSessions(): PromiseLike<RecentSessionRow[] | null>;
};

export type TodaySessionState = {
  credited: number;
  creditedBanner: string | null;
  strengthOpen: SessionForDetection | undefined;
  allSessions: RecentSessionRow[];
  todaySessions: RecentSessionRow[];
};

/**
 * Create loader deps from a Supabase client.
 * Factory ensures the page does no argument plumbing.
 */
export function makeTodayLoaderDeps(
  supabase: SupabaseClient<Database>,
  dateRange: { yesterday: string; weekAheadEnd: string }
): TodayLoaderDeps {
  return {
    fetchOpenSessions: () =>
      supabase
        .from("sessions")
        .select("id, local_date, started_at, actual_type, status")
        .in("status", ["planned", "in_progress"])
        .order("local_date", { ascending: false })
        .limit(20)
        .then((res) => res.data),
    
    closeStale: (input, today) =>
      closeStaleSessions(supabase, input, today),
    
    fetchRecentSessions: () =>
      supabase
        .from("sessions")
        .select("id, status, actual_type, local_date, program_day_id, started_at, created_at")
        .gte("local_date", dateRange.yesterday)
        .lte("local_date", dateRange.weekAheadEnd)
        .order("created_at", { ascending: false })
        .then((res) => res.data),
  };
}

/**
 * Load today's session state: closes stale sessions BEFORE reading recent sessions.
 * Ensures resume detection, missed-yesterday check, and today's override see post-close statuses.
 * - creditedBanner reflects the count closeStale returned
 * - strengthOpen searches all fetched sessions (not just today's)
 * - closeStale receives each row's real started_at
 * - fetchRecentSessions called only after closeStale resolves
 */
export async function loadTodaySessionState(
  deps: TodayLoaderDeps,
  localToday: string
): Promise<TodaySessionState> {
  const openRows = await deps.fetchOpenSessions();
  const openRowsArray = openRows ?? [];
  
  // Close stale sessions FIRST - receives real started_at from each row
  const credited = await deps.closeStale(openRowsArray, localToday);
  
  // Read recent sessions AFTER closing stale, so statuses reflect the close
  const recentSessions = await deps.fetchRecentSessions();
  const allSessions = recentSessions ?? [];
  const todaySessions = allSessions.filter((s) => s.local_date === localToday);
  
  // Find open strength session - searches all sessions
  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);
  
  // Generate banner from credited count
  const creditedBanner = creditedBannerText(credited);
  
  return {
    credited,
    creditedBanner,
    strengthOpen,
    allSessions,
    todaySessions,
  };
}
