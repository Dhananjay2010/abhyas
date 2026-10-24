import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveStaleFinish, type StaleFinishInput } from "./stale-duration";
import { buildCloseStaleDeps, type CloseStaleDeps } from "./close-stale-deps";

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
  const lastSetCompletedAt = new Map<string, string | null>();

  for (const row of rows) {
    const sets = row.session_sets ?? [];
    
    // Check if session has working sets
    if (sets.some((x) => !x.is_warmup_set)) {
      trained.add(row.session_id);
    }

    // Find the latest completed_at across ALL sets (warmup + working)
    const latestSet = sets
      .filter((s) => s.completed_at !== null)
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0];
    
    if (latestSet?.completed_at) {
      const existing = lastSetCompletedAt.get(row.session_id);
      if (!existing || latestSet.completed_at > existing) {
        lastSetCompletedAt.set(row.session_id, latestSet.completed_at);
      }
    }
  }

  // Identify truly stale sessions based on elapsed time OR newer session rule
  const stale: string[] = [];
  const byId = new Map(open.map((s) => [s.id, s]));

  // Find the newest session (latest started_at)
  let newestStartedAt: string | null = null;
  for (const session of open) {
    if (session.started_at) {
      if (!newestStartedAt || session.started_at > newestStartedAt) {
        newestStartedAt = session.started_at;
      }
    }
  }

  for (const id of ids) {
    const session = byId.get(id);
    
    // Planned rows (no started_at) dated before today become skipped
    if (!session?.started_at) {
      if (session && session.local_date < today) {
        stale.push(id);
      }
      continue;
    }

    const lastActivity = lastSetCompletedAt.get(id) ?? session.started_at;
    const lastActivityMs = Date.parse(lastActivity);
    const elapsedSeconds = (nowMs - lastActivityMs) / 1000;

    // A session is stale if:
    // 1. It has been inactive for more than 6 hours, OR
    // 2. A newer session exists (newer started_at)
    const hasNewerSession = newestStartedAt && session.started_at < newestStartedAt;
    const isInactive = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;

    if (isInactive || hasNewerSession) {
      stale.push(id);
    }
  }

  if (stale.length === 0) return 0;

  const completed = stale.filter((id) => trained.has(id));
  const abandoned = stale.filter((id) => !trained.has(id));

  await Promise.all([
    ...completed.map(async (id) => {
      const session = byId.get(id);
      if (!session?.started_at) return;

      const workingSetCount = trained.has(id) ? 1 : 0;
      const input: StaleFinishInput = {
        startedAt: session.started_at,
        lastSetCompletedAt: lastSetCompletedAt.get(id) ?? null,
        workingSetCount,
      };

      const finish = resolveStaleFinish(input);
      await deps.markSessionDone(id, finish.status, finish.endedAt, finish.durationSeconds);
    }),
    ...abandoned.map(async (id) => {
      const session = byId.get(id);
      
      // Planned rows (no started_at) are marked skipped with no duration
      if (!session?.started_at) {
        await deps.markSessionDone(id, "skipped", new Date().toISOString(), 0);
        return;
      }

      const input: StaleFinishInput = {
        startedAt: session.started_at,
        lastSetCompletedAt: null,
        workingSetCount: 0,
      };

      const finish = resolveStaleFinish(input);
      await deps.markSessionDone(id, finish.status, finish.endedAt, finish.durationSeconds);
    }),
  ]);

  return completed.length;
}
