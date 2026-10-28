import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveStaleFinishExtended, type StaleFinishInputExtended } from "./stale-duration";
import { buildCloseStaleDeps, supabaseCloseStaleQueries } from "./close-stale-deps";
import type { CloseStaleDeps } from "./close-stale-deps";
import { secondsSinceIso, isoFromMs } from "@/lib/dates";

export type { CloseStaleDeps };

type Client = SupabaseClient<Database>;

/**
 * Stale session threshold: 6 hours of inactivity (no logged sets).
 * A session inactive for longer than this is auto-closed.
 */
export const STALE_INACTIVITY_THRESHOLD_SECONDS = 21600;

/**
 * Helper to check if a session type is strength (weights or bodyweight).
 */
function isStrength(actualType: string | null): boolean {
  return actualType === "weights" || actualType === "bodyweight";
}

/**
 * Shared helper: compute the newest strength session's started_at among open sessions.
 * Used by both closeStaleSessionsCore and getInProgressSession to ensure identical behavior.
 * 
 * @param openSessions Array of open sessions (status in ['planned', 'in_progress'])
 * @returns The latest started_at among strength sessions, or null if none found
 */
export function computeNewestStrengthStartedAt(
  openSessions: Array<{ started_at: string | null; actual_type: string | null }>
): string | null {
  let newest: string | null = null;
  for (const session of openSessions) {
    if (session.started_at && isStrength(session.actual_type)) {
      if (!newest || session.started_at > newest) {
        newest = session.started_at;
      }
    }
  }
  return newest;
}

/**
 * Shared helper: find the last activity time from a set of completed sets.
 * Used by both closeStaleSessionsCore and getInProgressSession to ensure identical behavior.
 * 
 * Considers ALL sets (warm-ups and working sets) because any logged set is activity.
 * 
 * @param sets Array of sets with completed_at timestamps
 * @returns The latest completed_at, or null if no sets have completed_at
 */
export function findLastSetCompletedAt(
  sets: Array<{ completed_at: string | null }>
): string | null {
  let latest: string | null = null;
  for (const set of sets) {
    if (set.completed_at) {
      if (!latest || set.completed_at > latest) {
        latest = set.completed_at;
      }
    }
  }
  return latest;
}

/**
 * Pure predicate: determine if a session is stale according to #111's rule.
 * 
 * A session is stale if:
 * 1. It has been inactive for >= STALE_INACTIVITY_THRESHOLD_SECONDS (6h), OR
 * 2. For strength sessions: a newer strength session exists (by started_at), OR
 * 3. Special cases for sessions with no started_at:
 *    - No sets and dated before today (planned)
 *    - No sets and status is in_progress (stuck state)
 * 
 * This is extracted from closeStaleSessionsCore and must match its behavior exactly.
 */
export function isSessionStale(params: {
  startedAt: string | null;
  lastSetCompletedAt: string | null;
  localDate: string;
  status: string;
  actualType: string | null;
  newestStrengthStartedAt: string | null;
  today: string;
  nowMs: number;
}): boolean {
  const {
    startedAt,
    lastSetCompletedAt,
    localDate,
    status,
    actualType,
    newestStrengthStartedAt,
    today,
    nowMs,
  } = params;

  // Case 1: No started_at
  if (!startedAt) {
    if (!lastSetCompletedAt) {
      // No started_at and no sets - stale if:
      // - planned rows dated before today, or
      // - in_progress rows (rare stuck state)
      return localDate < today || status === "in_progress";
    }
    // Has sets but no started_at - use last set time for staleness check
    const elapsedSeconds = secondsSinceIso(lastSetCompletedAt, nowMs);
    return elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;
  }

  // Case 2: Normal case with started_at
  const lastActivity = lastSetCompletedAt ?? startedAt;
  const elapsedSeconds = secondsSinceIso(lastActivity, nowMs);
  
  // Check inactivity threshold
  const isInactive = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;
  
  // Check if a newer strength session exists (strength sessions only)
  const hasNewerStrengthSession = 
    isStrength(actualType) &&
    newestStrengthStartedAt !== null && 
    startedAt < newestStrengthStartedAt;
  
  return isInactive || hasNewerStrengthSession;
}

export type OpenSession = { 
  id: string; 
  local_date: string;
  started_at: string | null;
  actual_type: string | null;
  status: string;
};

/**
 * Close out sessions left open after extended inactivity.
 *
 * Nothing used to do this, and the consequence was worse than untidy history.
 * Both `session_volume` and the streak calculation require
 * `status = 'completed'`, so a session that was actually trained but never
 * walked through the cool-down and summary — the user closed the app, or hit
 * Leave — contributed **nothing**. No streak credit, no volume, no point on any
 * chart, with every set sitting in the database the whole time. Same day it was
 * recoverable, because Today offers "Resume session"; once the local date
 * rolled over, both Today and `startSession` filter on today's date and it was
 * stranded permanently.
 *
 * The rule is deliberately simple and stated rather than tuned: a stale session
 * with **at least one working set** counts as completed, because the person
 * trained. One with none is marked skipped, because they did not. Anything more
 * clever — a fraction of planned sets, a minimum duration — would be an
 * arbitrary line that is harder to explain than to defend.
 *
 * Sessions are identified by ELAPSED TIME since the last logged set (or started_at
 * if there are no sets yet), not by local_date comparison. A session inactive for
 * more than STALE_INACTIVITY_THRESHOLD_SECONDS is closed, regardless of timezone.
 *
 * `completed_at` and `duration_seconds` are set by resolveStaleFinish based on
 * the last logged set.
 *
 * Safe to call on every load of Today. With nothing stale it makes no database
 * call at all.
 *
 * Returns how many sessions were credited as completed, so the caller can say
 * so rather than changing the numbers silently.
 */
export async function closeStaleSessions(
  supabase: Client,
  open: OpenSession[],
  today: string,
): Promise<number> {
  const queries = supabaseCloseStaleQueries(supabase);
  const deps: CloseStaleDeps = buildCloseStaleDeps(queries);
  return closeStaleSessionsCore(deps, open, Date.now(), today);
}

export async function closeStaleSessionsCore(
  deps: CloseStaleDeps,
  open: OpenSession[],
  nowMs: number,
  today: string,
): Promise<number> {
  if (open.length === 0) return 0;

  const ids = open.map((s) => s.id);

  // Fetch session exercises with their sets to determine:
  // 1. Whether the session has working sets (completed vs skipped)
  // 2. The last set's completed_at to calculate ended_at
  const rows = await deps.fetchSessionExercises(ids);

  const trained = new Set<string>();
  const workingSetCounts = new Map<string, number>();
  const firstSetCompletedAt = new Map<string, string | null>();
  const lastSetCompletedAt = new Map<string, string | null>();
  const lastSetRestSeconds = new Map<string, number | null>();

  for (const row of rows) {
    const sets = row.session_sets ?? [];
    
    // Count working sets (non-warmup sets)
    const workingSets = sets.filter((x) => !x.is_warmup_set);
    if (workingSets.length > 0) {
      trained.add(row.session_id);
      const existingCount = workingSetCounts.get(row.session_id) ?? 0;
      workingSetCounts.set(row.session_id, existingCount + workingSets.length);
    }

    // Find the earliest and latest completed_at across ALL sets (warmup + working)
    const completedSets = sets.filter((s) => s.completed_at !== null);
    if (completedSets.length > 0) {
      const sortedSets = completedSets.sort((a, b) => 
        (a.completed_at ?? "").localeCompare(b.completed_at ?? "")
      );
      const earliestSet = sortedSets[0];
      const latestSet = sortedSets[sortedSets.length - 1];
      
      if (earliestSet?.completed_at) {
        const existing = firstSetCompletedAt.get(row.session_id);
        if (!existing || earliestSet.completed_at < existing) {
          firstSetCompletedAt.set(row.session_id, earliestSet.completed_at);
        }
      }
      
      if (latestSet?.completed_at) {
        const existing = lastSetCompletedAt.get(row.session_id);
        if (!existing || latestSet.completed_at > existing) {
          lastSetCompletedAt.set(row.session_id, latestSet.completed_at);
          lastSetRestSeconds.set(row.session_id, row.rest_seconds);
        }
      }
    }
  }

  // Identify truly stale sessions based on elapsed time OR newer session rule
  const stale: string[] = [];
  const byId = new Map(open.map((s) => [s.id, s]));

  // Find the newest strength session using shared helper
  const newestStrengthStartedAt = computeNewestStrengthStartedAt(open);

  for (const id of ids) {
    const session = byId.get(id);
    if (!session) continue;
    
    const lastSetTime = lastSetCompletedAt.get(id);
    
    if (isSessionStale({
      startedAt: session.started_at,
      lastSetCompletedAt: lastSetTime ?? null,
      localDate: session.local_date,
      status: session.status,
      actualType: session.actual_type,
      newestStrengthStartedAt,
      today,
      nowMs,
    })) {
      stale.push(id);
    }
  }

  if (stale.length === 0) return 0;

  const completed = stale.filter((id) => trained.has(id));
  const abandoned = stale.filter((id) => !trained.has(id));

  const results = await Promise.all([
    ...completed.map(async (id) => {
      const session = byId.get(id);
      
      // If started_at is null, use the first set's completed_at as a fallback
      const startedAt = session?.started_at ?? firstSetCompletedAt.get(id);
      if (!startedAt) return false;

      const workingSetCount = workingSetCounts.get(id) ?? 0;
      const input: StaleFinishInputExtended = {
        startedAt,
        lastSetCompletedAt: lastSetCompletedAt.get(id) ?? null,
        workingSetCount,
        restSeconds: lastSetRestSeconds.get(id) ?? null,
      };

      const finish = resolveStaleFinishExtended(input);
      
      // Cap duration at 6 hours (21600 seconds) to prevent unrealistic values
      const cappedDuration = finish.durationSeconds !== null 
        ? Math.min(finish.durationSeconds, STALE_INACTIVITY_THRESHOLD_SECONDS)
        : null;
      
      // If timestamps are invalid, use now for completed_at (never leave user stuck)
      const finalEndedAt = finish.endedAt ?? isoFromMs(nowMs);
      
      try {
        const updated = await deps.markSessionDone(id, finish.status, finalEndedAt, cappedDuration);
        // Only count as credited if the update succeeded AND status is completed
        return updated && finish.status === "completed";
      } catch (error) {
        // Log error but don't fail the entire operation
        console.error(`Failed to mark session ${id} as done:`, error);
        return false;
      }
    }),
    ...abandoned.map(async (id) => {
      const session = byId.get(id);
      
      // Sessions with no started_at and no sets: mark as skipped
      if (!session?.started_at) {
        const firstSetTime = firstSetCompletedAt.get(id);
        const lastSetTime = lastSetCompletedAt.get(id);
        if (!firstSetTime) {
          // No started_at, no sets - mark as skipped
          try {
            if (session?.status === "planned") {
              await deps.markPlannedSkipped(id);
            } else {
              // in_progress rows need to be marked done with duration null
              await deps.markSessionDone(id, "skipped", isoFromMs(nowMs), null);
            }
          } catch (error) {
            console.error(`Failed to mark session ${id} as skipped:`, error);
          }
          return false;
        }
        // Has sets - use first set as start, last set as end
        const input: StaleFinishInputExtended = {
          startedAt: firstSetTime,
          lastSetCompletedAt: lastSetTime ?? firstSetTime,
          workingSetCount: 0,
          restSeconds: lastSetRestSeconds.get(id) ?? null,
        };
        const finish = resolveStaleFinishExtended(input);
        const finalEndedAt = finish.endedAt ?? isoFromMs(nowMs);
        try {
          await deps.markSessionDone(id, finish.status, finalEndedAt, finish.durationSeconds);
        } catch (error) {
          console.error(`Failed to mark abandoned session ${id} as done:`, error);
        }
        return false;
      }

      const input: StaleFinishInputExtended = {
        startedAt: session.started_at,
        lastSetCompletedAt: null,
        workingSetCount: 0,
        restSeconds: undefined,
      };

      const finish = resolveStaleFinishExtended(input);
      const finalEndedAt = finish.endedAt ?? isoFromMs(nowMs);
      
      try {
        await deps.markSessionDone(id, finish.status, finalEndedAt, finish.durationSeconds);
      } catch (error) {
        console.error(`Failed to mark abandoned session ${id} as done:`, error);
      }
      // Abandoned sessions are never credited (they're skipped)
      return false;
    }),
  ]);

  return results.filter(Boolean).length;
}
