import { resolveStaleFinish } from "./stale-duration";
import type { CloseStaleSessionsDeps } from "./close-stale-deps";

export type OpenSession = { id: string; local_date: string };

/**
 * Close out sessions left open on an earlier day.
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
 * `completed_at` is set so the row looks like any other finished session.
 * `duration_seconds` is calculated based on the logged sets and rest intervals.
 */
export async function closeStaleSessions(
  deps: CloseStaleSessionsDeps,
  open: OpenSession[],
  today: string,
): Promise<number> {
  const stale = open.filter((s) => s.local_date < today);
  if (stale.length === 0) return 0;

  const ids = stale.map((s) => s.id);

  // Fetch session data (started_at) and exercise/set data
  const sessions = await deps.loadSessions(ids);
  const rows = await deps.loadExercisesWithSets(ids);

  // Build map of session_id -> { workingSetCount, lastSetCompletedAt, lastSetRestSeconds, startedAt }
  type SessionData = {
    startedAt: string;
    workingSetCount: number;
    lastSetCompletedAt: string | null;
    lastSetRestSeconds: number | null;
  };

  const sessionMap = new Map<string, SessionData>();

  // Initialize with session started_at
  for (const session of sessions) {
    sessionMap.set(session.id, {
      startedAt: session.started_at ?? new Date(0).toISOString(),
      workingSetCount: 0,
      lastSetCompletedAt: null,
      lastSetRestSeconds: null,
    });
  }

  // Count working sets and track last set timestamp + rest seconds
  for (const row of rows) {
    const data = sessionMap.get(row.session_id);
    if (!data) continue;

    const sets = row.session_sets ?? [];

    for (const set of sets) {
      if (!set.is_warmup_set) {
        data.workingSetCount++;
      }
      if (set.completed_at) {
        if (!data.lastSetCompletedAt || set.completed_at > data.lastSetCompletedAt) {
          data.lastSetCompletedAt = set.completed_at;
          // Track the rest_seconds for the exercise that had this last set
          data.lastSetRestSeconds = row.rest_seconds;
        }
      }
    }
  }

  // Update each stale session using resolveStaleFinish
  const updates = [];
  for (const [sessionId, data] of sessionMap.entries()) {
    const result = resolveStaleFinish({
      startedAt: data.startedAt,
      lastSetCompletedAt: data.lastSetCompletedAt,
      workingSetCount: data.workingSetCount,
      restSeconds: data.lastSetRestSeconds,
    });

    updates.push(
      deps.updateSession(sessionId, {
        status: result.status,
        completed_at: result.status === "completed" ? result.endedAt : null,
        duration_seconds: result.durationSeconds,
      })
    );
  }

  await Promise.all(updates);

  // Count how many completed (i.e. had at least one working set)
  return Array.from(sessionMap.values()).filter((d) => d.workingSetCount > 0).length;
}
