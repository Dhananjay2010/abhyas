/**
 * Pure helpers for detecting session states on Today page.
 */

export type SessionForDetection = {
  id?: string;
  status: string;
  actual_type: string | null;
  local_date?: string;
  started_at?: string | null;
};

export type OpenSessionForClose = {
  id: string;
  local_date: string;
  started_at: string | null;
};

function isStrength(actualType: string | null): boolean {
  return actualType === "weights" || actualType === "bodyweight";
}

/**
 * Find an open strength session (in_progress from any date, or planned from today).
 * Returns the first in_progress strength session regardless of date, or falls back
 * to the first planned strength session from today's sessions.
 */
export function findOpenStrengthSession(
  allSessions: SessionForDetection[],
  todaySessions: SessionForDetection[]
): SessionForDetection | undefined {
  const inProgress = allSessions.find(
    (s) => s.status === "in_progress" && isStrength(s.actual_type)
  );
  
  if (inProgress) return inProgress;
  
  return todaySessions.find(
    (s) => s.status === "planned" && isStrength(s.actual_type)
  );
}

/**
 * Check if any of yesterday's sessions are still in_progress strength sessions.
 */
export function isYesterdayStillInProgress(
  yesterdaySessions: SessionForDetection[]
): boolean {
  return yesterdaySessions.some(
    (s) => s.status === "in_progress" && isStrength(s.actual_type)
  );
}

/**
 * Prepare open sessions for closeStaleSessions.
 * Ensures real started_at values are preserved, not derived from local_date.
 */
export function prepareOpenSessions(
  sessions: OpenSessionForClose[]
): OpenSessionForClose[] {
  return sessions.map(s => ({
    id: s.id,
    local_date: s.local_date,
    started_at: s.started_at
  }));
}

/**
 * Determine if a session should redirect to /today based on its status.
 * Only completed/skipped sessions redirect; in_progress and planned stay accessible.
 */
export function shouldRedirectSession(status: string): boolean {
  return status === "completed" || status === "skipped";
}
