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
  actual_type?: string | null;
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
 * Build the input for closeStaleSessions from Today page's open sessions query.
 */
export function todayCloseInput(
  openRows: Array<{ id: string; local_date: string; started_at: string | null; actual_type: string | null; status: string }> | null
): Array<{ id: string; local_date: string; started_at: string | null; actual_type: string | null; status: string }> {
  if (!openRows) return [];
  return openRows.map(row => ({
    id: row.id,
    local_date: row.local_date,
    started_at: row.started_at,
    actual_type: row.actual_type,
    status: row.status
  }));
}

/**
 * Get the credited sessions banner text for Today page.
 * Returns null if no banner should be shown.
 */
export function creditedBannerText(credited: number): string | null {
  if (credited === 0) return null;
  if (credited === 1) {
    return "A session you had left open has been counted — you had logged sets in it.";
  }
  return `${credited} sessions you had left open have been counted — you had logged sets in them.`;
}

/**
 * Determine if a session should redirect to /today based on its status.
 * Only completed sessions redirect; in_progress and planned stay accessible.
 */
export function shouldRedirectSession(status: string): boolean {
  return status === "completed";
}
