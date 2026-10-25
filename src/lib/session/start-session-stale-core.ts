import type { OpenSession } from "./close-stale";

export interface StartSessionStaleDeps {
  /**
   * Current local date in YYYY-MM-DD format.
   */
  today: string;
  
  /**
   * Query to read open sessions (planned, in_progress, skipped) for the user.
   */
  readOpenSessions: () => Promise<OpenSession[]>;
  
  /**
   * Close stale sessions according to #111's 6h inactivity rule.
   * Returns the number of sessions credited (completed), not closed.
   */
  closeStaleSessions: (
    sessions: OpenSession[],
    today: string
  ) => Promise<number>;
  
  /**
   * After closing stale sessions, check if ANY in_progress session remains
   * (regardless of date). This catches fresh cross-date sessions that weren't
   * closed by the 6h rule.
   */
  checkRemainingInProgress: () => Promise<string | null>;
}

export type StartSessionStaleResult =
  | { ok: true; shouldInsert: true }
  | { ok: true; shouldInsert: false; resumeSessionId: string }
  | { ok: false; error: string };

/**
 * Core logic for deciding whether to insert a new session or resume an existing one
 * after closing stale sessions from other dates.
 * 
 * This is extracted from startSession's L3 logic (actions.ts:200-207) to make it
 * testable with dependency injection.
 * 
 * The decision rules:
 * 1. If there are sessions from other dates (local_date !== today), close stale ones
 * 2. After closing, check if ANY in_progress session remains (regardless of date)
 * 3. If yes, resume that session (cross-date fresh session kept by #111's 6h rule)
 * 4. If no, insert a new session for today
 * 
 * This handles the timezone shift case: a session started 2h ago in UTC-5, user moves
 * to UTC+1 (now a different date), but the session is fresh (<6h) so closeStaleSessions
 * doesn't close it. We detect it's still in_progress and resume via existingSessionId.
 */
export async function startSessionStaleCore(
  deps: StartSessionStaleDeps
): Promise<StartSessionStaleResult> {
  try {
    const openSessions = await deps.readOpenSessions();
    
    // Filter sessions from other dates
    const staleCandidates = openSessions.filter(
      s => s.local_date !== deps.today
    );
    
    if (staleCandidates.length === 0) {
      // No sessions from other dates, safe to insert
      return { ok: true, shouldInsert: true };
    }
    
    // Only pass in_progress sessions to closeStaleSessions
    // (planned and skipped sessions are ignored by the stale logic)
    const inProgressFromOtherDates = staleCandidates.filter(
      s => s.status === "in_progress"
    );
    
    if (inProgressFromOtherDates.length === 0) {
      // Only planned/skipped from other dates, safe to insert
      return { ok: true, shouldInsert: true };
    }
    
    // Close stale sessions (6h+ inactive, or superseded by newer strength session)
    await deps.closeStaleSessions(inProgressFromOtherDates, deps.today);
    
    // Re-check: did closeStaleSessions leave ANY in_progress session?
    // This handles timezone shifts where a fresh cross-date session wasn't closed
    // (< 6h) and should be resumed instead of inserting. We check for ANY in_progress
    // session (regardless of date) because the unique index allows only one in_progress
    // per user, and trying to insert when one exists will fail with 23505.
    const remainingSessionId = await deps.checkRemainingInProgress();
    
    if (remainingSessionId) {
      // Fresh session wasn't closed (< 6h), resume it via #111's existingSessionId logic
      return { ok: true, shouldInsert: false, resumeSessionId: remainingSessionId };
    }
    
    // All stale sessions were closed, insert new session
    return { ok: true, shouldInsert: true };
    
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
