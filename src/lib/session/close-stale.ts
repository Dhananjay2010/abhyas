import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveStaleFinish } from "./stale-duration";

type Client = SupabaseClient<Database>;

export type { Client };
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
 * `duration_seconds` is deliberately left null: we do not know how long it took,
 * and inventing a number would be worse than showing none.
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
  const stale = open.filter((s) => s.local_date < today);
  if (stale.length === 0) return 0;

  const ids = stale.map((s) => s.id);

  // Fetch session data (started_at) and exercise/set data
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, started_at")
    .in("id", ids);

  const { data: rows } = await supabase
    .from("session_exercises")
    .select("session_id, session_sets(id, is_warmup_set, completed_at)")
    .in("session_id", ids);

  // Build map of session_id -> { workingSetCount, lastSetCompletedAt, startedAt }
  type SessionData = {
    startedAt: string;
    workingSetCount: number;
    lastSetCompletedAt: string | null;
  };

  const sessionMap = new Map<string, SessionData>();

  // Initialize with session started_at
  for (const session of sessions ?? []) {
    if (!session.started_at) continue; // Skip sessions without started_at
    sessionMap.set(session.id, {
      startedAt: session.started_at,
      workingSetCount: 0,
      lastSetCompletedAt: null,
    });
  }

  // Count working sets and track last set timestamp
  for (const row of rows ?? []) {
    const data = sessionMap.get(row.session_id);
    if (!data) continue;

    const sets = (row.session_sets ?? []) as Array<{
      is_warmup_set: boolean;
      completed_at: string | null;
    }>;

    for (const set of sets) {
      if (!set.is_warmup_set) {
        data.workingSetCount++;
      }
      if (set.completed_at) {
        if (!data.lastSetCompletedAt || set.completed_at > data.lastSetCompletedAt) {
          data.lastSetCompletedAt = set.completed_at;
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
    });

    updates.push(
      supabase
        .from("sessions")
        .update({
          status: result.status,
          completed_at: result.status === "completed" ? result.endedAt : null,
          duration_seconds: result.durationSeconds,
        })
        .eq("id", sessionId)
    );
  }

  await Promise.all(updates);

  // Count how many were completed
  const completedCount = Array.from(sessionMap.values()).filter(
    (data) => data.workingSetCount > 0
  ).length;

  return completedCount;
}
