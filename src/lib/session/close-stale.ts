import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

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

  // Warm-up sets do not count as having trained; they are logged against the
  // same exercises, so they have to be filtered out rather than counted.
  const { data: rows } = await supabase
    .from("session_exercises")
    .select("session_id, session_sets(id, is_warmup_set)")
    .in("session_id", ids);

  const trained = new Set<string>();
  for (const row of rows ?? []) {
    const sets = (row.session_sets ?? []) as { is_warmup_set: boolean }[];
    if (sets.some((x) => !x.is_warmup_set)) trained.add(row.session_id);
  }

  const completed = ids.filter((id) => trained.has(id));
  const abandoned = ids.filter((id) => !trained.has(id));

  await Promise.all([
    completed.length > 0
      ? supabase
          .from("sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .in("id", completed)
      : Promise.resolve(),
    abandoned.length > 0
      ? supabase.from("sessions").update({ status: "skipped" }).in("id", abandoned)
      : Promise.resolve(),
  ]);

  return completed.length;
}
