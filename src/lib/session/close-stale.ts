import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveStaleFinish, type StaleFinishInput } from "./stale-duration";
import { buildCloseStaleDeps } from "./close-stale-deps";
import type { CloseStaleDeps } from "./close-stale-deps";
import { secondsSinceIso } from "@/lib/dates";

export type { CloseStaleDeps };

type Client = SupabaseClient<Database>;

/**
 * Stale session threshold: 6 hours of inactivity (no logged sets).
 * A session inactive for longer than this is auto-closed.
 */
export const STALE_INACTIVITY_THRESHOLD_SECONDS = 21600;

export type OpenSession = { 
  id: string; 
  local_date: string;
  started_at: string | null;
  actual_type: string | null;
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
  const deps = buildCloseStaleDeps(supabase);
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

  for (const row of rows) {
    const sets = row.session_sets ?? [];
    
    // Count working sets (non-warmup sets)
    const workingSets = sets.filter((x) => !x.is_warmup_set);
    if (workingSets.length > 0) {
      trained.add(row.session_id);
      const existingCount = workingSetCounts.get(row.session_id) ?? 0;
      workingSetCounts.set(row.session_id, existingCount + workingSets.length);
    }

    // Find the earliest completed_at across ALL sets (warmup + working)
    const earliestSet = sets
      .filter((s) => s.completed_at !== null)
      .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))[0];
    
    if (earliestSet?.completed_at) {
      const existing = firstSetCompletedAt.get(row.session_id);
      if (!existing || earliestSet.completed_at < existing) {
        firstSetCompletedAt.set(row.session_id, earliestSet.completed_at);
      }
    }
  }

  // Identify truly stale sessions based on elapsed time OR newer session rule
  const stale: string[] = [];
  const byId = new Map(open.map((s) => [s.id, s]));

  // Helper to check if a session type is strength (weights or bodyweight)
  const isStrength = (actualType: string | null): boolean => {
    return actualType === "weights" || actualType === "bodyweight";
  };

  // Find the newest strength session (latest started_at among strength sessions only)
  let newestStrengthStartedAt: string | null = null;
  for (const session of open) {
    if (session.started_at && isStrength(session.actual_type)) {
      if (!newestStrengthStartedAt || session.started_at > newestStrengthStartedAt) {
        newestStrengthStartedAt = session.started_at;
      }
    }
  }

  for (const id of ids) {
    const session = byId.get(id);
    
    // Planned rows (no started_at) dated before today become skipped
    if (!session?.started_at) {
      // If there are logged sets, use the first set's time as started_at fallback
      const fallbackStartedAt = firstSetCompletedAt.get(id);
      if (!fallbackStartedAt) {
        // No started_at and no sets - mark as stale only if dated before today
        if (session && session.local_date < today) {
          stale.push(id);
        }
        continue;
      }
      // Has sets but no started_at - use set time for staleness check
      const elapsedSeconds = secondsSinceIso(fallbackStartedAt, nowMs);
      const isInactive = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;
      if (isInactive) {
        stale.push(id);
      }
      continue;
    }

    const lastActivity = firstSetCompletedAt.get(id) ?? session.started_at;
    const elapsedSeconds = secondsSinceIso(lastActivity, nowMs);

    // A session is stale if:
    // 1. It has been inactive for more than 6 hours, OR
    // 2. For strength sessions: a newer strength session exists (newer started_at)
    //    Non-strength sessions (Breathe, yoga) don't trigger closure of strength sessions
    const hasNewerStrengthSession = 
      isStrength(session.actual_type) &&
      newestStrengthStartedAt && 
      session.started_at < newestStrengthStartedAt;
    const isInactive = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;

    if (isInactive || hasNewerStrengthSession) {
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
      const input: StaleFinishInput = {
        startedAt,
        lastSetCompletedAt: firstSetCompletedAt.get(id) ?? null,
        workingSetCount,
      };

      const finish = resolveStaleFinish(input);
      
      // Cap duration at 6 hours (21600 seconds) to prevent unrealistic values
      const cappedDuration = Math.min(finish.durationSeconds, STALE_INACTIVITY_THRESHOLD_SECONDS);
      
      try {
        const updated = await deps.markSessionDone(id, finish.status, finish.endedAt, cappedDuration);
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
        if (!firstSetTime) {
          // No started_at, no sets - mark planned sessions as skipped
          try {
            await deps.markPlannedSkipped(id);
          } catch (error) {
            console.error(`Failed to mark planned session ${id} as skipped:`, error);
          }
          return false;
        }
        // Has sets - use first set time
        const input: StaleFinishInput = {
          startedAt: firstSetTime,
          lastSetCompletedAt: firstSetTime,
          workingSetCount: 0,
        };
        const finish = resolveStaleFinish(input);
        try {
          await deps.markSessionDone(id, finish.status, finish.endedAt, finish.durationSeconds);
        } catch (error) {
          console.error(`Failed to mark abandoned session ${id} as done:`, error);
        }
        return false;
      }

      const input: StaleFinishInput = {
        startedAt: session.started_at,
        lastSetCompletedAt: null,
        workingSetCount: 0,
      };

      const finish = resolveStaleFinish(input);
      
      try {
        await deps.markSessionDone(id, finish.status, finish.endedAt, finish.durationSeconds);
      } catch (error) {
        console.error(`Failed to mark abandoned session ${id} as done:`, error);
      }
      // Abandoned sessions are never credited (they're skipped)
      return false;
    }),
  ]);

  return results.filter(Boolean).length;
}
