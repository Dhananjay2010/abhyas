/**
 * Today page loader: fetches open sessions, closes stale ones, and prepares view state.
 * Tested with typed deps to ensure the page wiring is correct.
 */

import type { SessionForDetection } from "./session-detection";
import { findOpenStrengthSession, creditedBannerText } from "./session-detection";

export type OpenSessionRow = {
  id: string;
  local_date: string;
  started_at: string | null;
  actual_type: string | null;
  status: string;
};

export type TodayLoaderDeps = {
  fetchOpenSessions(): PromiseLike<OpenSessionRow[] | null>;
  closeStale(input: OpenSessionRow[], today: string): Promise<number>;
};

export type TodaySessionState = {
  credited: number;
  creditedBanner: string | null;
  strengthOpen: SessionForDetection | undefined;
};

/**
 * Load today's session state: close stale sessions and prepare view data.
 * - c2: creditedBanner reflects the count closeStale returned
 * - e1: strengthOpen searches all fetched sessions (not just today's)
 * - f2: closeStale receives each row's real started_at
 */
export async function loadTodaySessionState(
  deps: TodayLoaderDeps,
  allSessions: SessionForDetection[],
  todaySessions: SessionForDetection[],
  localToday: string
): Promise<TodaySessionState> {
  const openRows = await deps.fetchOpenSessions();
  const openRowsArray = openRows ?? [];
  
  // Close stale sessions - receives real started_at from each row
  const credited = await deps.closeStale(openRowsArray, localToday);
  
  // Find open strength session - searches all sessions
  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);
  
  // Generate banner from credited count
  const creditedBanner = creditedBannerText(credited);
  
  return {
    credited,
    creditedBanner,
    strengthOpen,
  };
}
