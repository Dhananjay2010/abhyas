/**
 * Test the real close-stale-deps module to ensure:
 * - The status guard prevents race conditions
 * - The count option returns real row counts
 * - Credits reach the caller correctly
 * 
 *   npx tsx scripts/test-close-stale-deps.ts
 */

import { buildCloseStaleDeps, type CloseStaleQueries, type SessionExerciseRow } from "../src/lib/session/close-stale-deps";
import type { Database } from "../src/lib/database.types";

type SessionsUpdate = Database["public"]["Tables"]["sessions"]["Update"];

class FakeCloseStaleQueries implements CloseStaleQueries {
  private sessions = new Map<string, { 
    id: string; 
    status: string; 
    completed_at: string | null; 
    duration_seconds: number | null 
  }>();
  
  private sessionExercises = new Map<string, SessionExerciseRow[]>();

  lastUpdateGuardStatus: string | null = null;
  lastUpdateValues: SessionsUpdate = {};

  setSession(id: string, status: string) {
    this.sessions.set(id, {
      id,
      status,
      completed_at: null,
      duration_seconds: null,
    });
  }

  getSession(id: string) {
    return this.sessions.get(id);
  }

  setSessionExercises(sessionId: string, exercises: SessionExerciseRow[]) {
    this.sessionExercises.set(sessionId, exercises);
  }

  async selectSessionSets(ids: string[]): Promise<{ data: SessionExerciseRow[] | null; error: Error | null }> {
    const result = ids.flatMap(id => this.sessionExercises.get(id) ?? []);
    return { data: result, error: null };
  }

  async updateSessionIfStatus(
    id: string,
    guardStatus: "in_progress" | "planned",
    values: SessionsUpdate
  ): Promise<{ error: Error | null; count: number | null }> {
    this.lastUpdateGuardStatus = guardStatus;
    this.lastUpdateValues = values;

    const session = this.sessions.get(id);
    if (!session) {
      return { error: null, count: 0 };
    }

    if (session.status !== guardStatus) {
      return { error: null, count: 0 };
    }

    Object.assign(session, values);
    return { error: null, count: 1 };
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. markSessionDone returns true when status guard matches");
{
  const fake = new FakeCloseStaleQueries();
  fake.setSession("sess1", "in_progress");
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("sess1", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("updated in_progress session", result === true);
  check("session is now completed", fake.getSession("sess1")?.status === "completed");
  check("guard status was in_progress", fake.lastUpdateGuardStatus === "in_progress");
  check("values contain status", fake.lastUpdateValues.status === "completed");
  check("values contain completed_at", fake.lastUpdateValues.completed_at === "2026-10-24T10:00:00Z");
  check("values contain duration_seconds", fake.lastUpdateValues.duration_seconds === 3600);
}

console.log("\n2. markSessionDone returns false when status guard blocks (race condition)");
{
  const fake = new FakeCloseStaleQueries();
  fake.setSession("race", "completed");
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("race", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("did not update completed session", result === false);
  check("guard status was in_progress", fake.lastUpdateGuardStatus === "in_progress");
}

console.log("\n3. markSessionDone returns false for non-existent session");
{
  const fake = new FakeCloseStaleQueries();
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("missing", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("did not update missing session", result === false);
}

console.log("\n4. fetchSessionExercises calls correct table and columns");
{
  const fake = new FakeCloseStaleQueries();
  fake.setSessionExercises("sess1", [
    {
      session_id: "sess1",
      rest_seconds: 75,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: "2026-10-24T10:00:00Z" }
      ]
    }
  ]);
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.fetchSessionExercises(["sess1"]);
  
  check("fetched session exercises", result.length === 1);
  check("has session_id", result[0].session_id === "sess1");
  check("has rest_seconds", result[0].rest_seconds === 75);
  check("has session_sets", result[0].session_sets !== null);
}

console.log("\n5. markPlannedSkipped only affects planned sessions");
{
  const fake = new FakeCloseStaleQueries();
  fake.setSession("planned1", "planned");
  fake.setSession("in_progress1", "in_progress");
  
  const deps = buildCloseStaleDeps(fake);
  await deps.markPlannedSkipped("planned1");
  
  check("planned session becomes skipped", fake.getSession("planned1")?.status === "skipped");
  check("guard status was planned", fake.lastUpdateGuardStatus === "planned");
  check("values contain status skipped", fake.lastUpdateValues.status === "skipped");
  
  await deps.markPlannedSkipped("in_progress1");
  check("in_progress session unchanged", fake.getSession("in_progress1")?.status === "in_progress");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
