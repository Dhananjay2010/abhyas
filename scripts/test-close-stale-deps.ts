/**
 * Test the real close-stale-deps module to ensure:
 * - The status guard prevents race conditions
 * - The count option returns real row counts
 * - Credits reach the caller correctly
 * 
 *   npx tsx scripts/test-close-stale-deps.ts
 */

import { buildCloseStaleDeps } from "../src/lib/session/close-stale-deps";

type UpdateOptions = { count?: "exact" | "estimated" | "planned" };
type UpdateResult = { error: null; count: number | null } | { error: Error; count: null };
type SelectResult<T> = { data: T[] | null; error: null } | { data: null; error: Error };

class FakeSupabaseClient {
  private sessions = new Map<string, { 
    id: string; 
    status: string; 
    completed_at: string | null; 
    duration_seconds: number | null 
  }>();
  
  private sessionExercises = new Map<string, {
    session_id: string;
    session_sets: Array<{
      id: string;
      is_warmup_set: boolean;
      completed_at: string | null;
    }> | null;
  }[]>();

  lastUpdateFilters: { id?: string; status?: string } = {};
  lastUpdateOptions: UpdateOptions = {};

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

  setSessionExercises(sessionId: string, exercises: typeof this.sessionExercises extends Map<string, infer T> ? T : never) {
    this.sessionExercises.set(sessionId, exercises);
  }

  from(table: string) {
    if (table === "sessions") {
      return {
        update: (data: Record<string, unknown>, options?: UpdateOptions) => {
          this.lastUpdateOptions = options ?? {};
          return {
            eq: (column: string, value: string) => {
              this.lastUpdateFilters[column as "id" | "status"] = value;
              return {
                eq: (col2: string, val2: string): UpdateResult => {
                  this.lastUpdateFilters[col2 as "id" | "status"] = val2;
                  
                  const session = this.sessions.get(this.lastUpdateFilters.id!);
                  if (!session) {
                    return { error: null, count: options?.count === "exact" ? 0 : null };
                  }
                  
                  if (this.lastUpdateFilters.status && session.status !== this.lastUpdateFilters.status) {
                    return { error: null, count: options?.count === "exact" ? 0 : null };
                  }
                  
                  Object.assign(session, data);
                  return { 
                    error: null, 
                    count: options?.count === "exact" ? 1 : null 
                  };
                }
              };
            }
          };
        }
      };
    } else if (table === "session_exercises") {
      return {
        select: (_columns: string) => ({
          in: (_column: string, values: string[]): SelectResult<unknown> => {
            const result = values.flatMap(id => this.sessionExercises.get(id) ?? []);
            return { data: result, error: null };
          }
        })
      };
    }
    throw new Error(`Unknown table: ${table}`);
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
  const fake = new FakeSupabaseClient();
  fake.setSession("sess1", "in_progress");
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("sess1", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("updated in_progress session", result === true);
  check("session is now completed", fake.getSession("sess1")?.status === "completed");
  check("count option was passed", fake.lastUpdateOptions.count === "exact");
  check("status filter was applied", fake.lastUpdateFilters.status === "in_progress");
}

console.log("\n2. markSessionDone returns false when status guard blocks (race condition)");
{
  const fake = new FakeSupabaseClient();
  fake.setSession("race", "completed");
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("race", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("did not update completed session", result === false);
  check("status filter was applied", fake.lastUpdateFilters.status === "in_progress");
}

console.log("\n3. markSessionDone returns false for non-existent session");
{
  const fake = new FakeSupabaseClient();
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.markSessionDone("missing", "completed", "2026-10-24T10:00:00Z", 3600);
  
  check("did not update missing session", result === false);
}

console.log("\n4. fetchSessionExercises calls correct table and columns");
{
  const fake = new FakeSupabaseClient();
  fake.setSessionExercises("sess1", [
    {
      session_id: "sess1",
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: "2026-10-24T10:00:00Z" }
      ]
    }
  ]);
  
  const deps = buildCloseStaleDeps(fake);
  const result = await deps.fetchSessionExercises(["sess1"]);
  
  check("fetched session exercises", result.length === 1);
  check("has session_id", result[0].session_id === "sess1");
  check("has session_sets", result[0].session_sets !== null);
}

console.log("\n5. markPlannedSkipped only affects planned sessions");
{
  const fake = new FakeSupabaseClient();
  fake.setSession("planned1", "planned");
  fake.setSession("in_progress1", "in_progress");
  
  const deps = buildCloseStaleDeps(fake);
  await deps.markPlannedSkipped("planned1");
  
  check("planned session becomes skipped", fake.getSession("planned1")?.status === "skipped");
  
  await deps.markPlannedSkipped("in_progress1");
  check("in_progress session unchanged", fake.getSession("in_progress1")?.status === "in_progress");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
