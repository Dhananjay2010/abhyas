/**
 * Pure helpers for Today page: session detection and banner text.
 */

export type SessionForDetection = {
  id?: string;
  status: string;
  actual_type: string | null;
  local_date?: string;
  started_at?: string | null;
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

/**
 * Return the href for resuming a previous-day open session, or null if the
 * session should use the normal start flow. When an open session's local_date
 * differs from today, return /session/{id} to link directly rather than calling
 * startSession (which would try to insert a new session with today's date and
 * hit the unique constraint).
 */
export function previousDayResumeHref(
  strengthOpen: SessionForDetection | undefined,
  localToday: string
): string | null {
  if (!strengthOpen) return null;
  if (!strengthOpen.local_date) return null;
  if (strengthOpen.local_date === localToday) return null;
  if (!strengthOpen.id) return null;
  return `/session/${strengthOpen.id}`;
}
