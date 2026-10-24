/**
 * Pure helpers for detecting session states on Today page.
 */

type SessionForDetection = {
  status: string;
  actual_type: string | null;
  local_date?: string;
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
