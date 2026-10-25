/**
 * Pick the latest completed strength session from today's sessions.
 * 
 * Used by the Today page to determine if a "Session complete" banner should show.
 * Returns the most recently created completed strength (weights/bodyweight) session,
 * or undefined if none exist.
 */

export type SessionForPicking = {
  status: string | null;
  actual_type: string | null;
  created_at: string | null;
};

export function pickLatestCompletedStrength(
  sessions: SessionForPicking[]
): SessionForPicking | undefined {
  const isStrength = (t: string | null) => t === "weights" || t === "bodyweight";
  
  return sessions
    .filter((s) => s.status === "completed" && isStrength(s.actual_type))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
}
