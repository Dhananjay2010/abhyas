/**
 * L2: Test the REAL getInProgressSession function.
 * 
 * Verifies:
 * - Returns the user's in_progress session regardless of local_date
 * - Returns null when no in-progress session exists
 * - Returns in_progress sessions from yesterday (after midnight bug fix)
 * - Returns the most recent in-progress session by started_at
 * - workingSetsLogged counts only is_warmup_set = false
 * - Warm-up sets are excluded from the count
 * - Multiple in-progress sessions: returns most recent by started_at (nulls last)
 * - 0-set sessions are returned (L3)
 * - Timezone changes don't hide in-progress sessions
 * - Completed/skipped/planned sessions are never returned
 * 
 *   npx tsx scripts/test-in-progress-session.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { getInProgressSession } from "../src/lib/session/in-progress";
import { localDateString } from "../src/lib/dates";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

class FakeSupabase {
  private sessions: Array<{
    id: string;
    user_id: string;
    status: string;
    started_at: string | null;
    local_date: string;
    program_days: { label: string } | null;
  }> = [];
  private sessionExercises: Array<{ id: string; session_id: string }> = [];
  private sessionSets: Array<{
    id: string;
    user_id: string;
    session_exercise_id: string;
    is_warmup_set: boolean;
  }> = [];

  addSession(
    id: string,
    userId: string,
    status: string,
    startedAt: string | null,
    localDate: string,
    label: string | null
  ) {
    this.sessions.push({
      id,
      user_id: userId,
      status,
      started_at: startedAt,
      local_date: localDate,
      program_days: label ? { label } : null,
    });
  }

  addExercise(id: string, sessionId: string) {
    this.sessionExercises.push({ id, session_id: sessionId });
  }

  addSet(
    id: string,
    userId: string,
    exerciseId: string,
    isWarmup: boolean
  ) {
    this.sessionSets.push({
      id,
      user_id: userId,
      session_exercise_id: exerciseId,
      is_warmup_set: isWarmup,
    });
  }

  from(table: string) {
    if (table === "sessions") {
      return {
        select: (cols: string) => {
          const chain = {
            data: this.sessions,
            eq: (col: string, val: string) => {
              chain.data = chain.data.filter((s) => (s as never)[col] === val);
              return chain;
            },
            order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
              chain.data = [...chain.data].sort((a, b) => {
                const aVal = (a as never)[col];
                const bVal = (b as never)[col];
                
                // Handle nulls according to nullsFirst (default true for Postgres)
                const nullsFirst = opts.nullsFirst !== false;
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return nullsFirst ? -1 : 1;
                if (bVal == null) return nullsFirst ? 1 : -1;
                
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return opts.ascending ? cmp : -cmp;
              });
              return chain;
            },
            limit: (n: number) => {
              chain.data = chain.data.slice(0, n);
              return Promise.resolve({ data: chain.data, error: null });
            },
          };
          return chain;
        },
      };
    }

    if (table === "session_exercises") {
      return {
        select: (cols: string) => ({
          eq: (col: string, val: string) => {
            const filtered = this.sessionExercises.filter(
              (e) => (e as never)[col] === val
            );
            return Promise.resolve({ data: filtered, error: null });
          },
        }),
      };
    }

    if (table === "session_sets") {
      return {
        select: () => ({
          eq: (col: string, val: string | boolean) => {
            let filtered = this.sessionSets.filter(
              (s) => (s as never)[col] === val
            );
            return {
              eq: (col2: string, val2: string | boolean) => {
                filtered = filtered.filter((s) => (s as never)[col2] === val2);
                return {
                  in: (col3: string, ids: string[]) => {
                    const finalFiltered = filtered.filter((s) =>
                      ids.includes(s.session_exercise_id)
                    );
                    return Promise.resolve({
                      data: finalFiltered,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        }),
      };
    }

    throw new Error(`Unknown table: ${table}`);
  }
}

(async () => {
  const today = localDateString("UTC");
  const yesterday = localDateString("UTC", new Date(Date.now() - 86400000));

  console.log("\n1. No in-progress session → returns null");
  {
    const fake = new FakeSupabase();
    fake.addSession("s1", "user1", "completed", "2026-10-24T10:00:00Z", today, "Push");
    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("no in-progress session", result === null, result ? result.id : "");
  }

  console.log("\n2. In-progress session from yesterday → IS returned (midnight fix)");
  {
    const fake = new FakeSupabase();
    fake.addSession("s2", "user1", "in_progress", "2026-10-23T11:00:00Z", yesterday, "Pull");
    fake.addExercise("ex1", "s2");
    fake.addSet("set1", "user1", "ex1", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("past-day in-progress IS returned", result !== null, result ? result.id : "null");
    check("correct session id", result?.id === "s2", result?.id);
    check("correct working sets", result?.workingSetsLogged === 1, String(result?.workingSetsLogged));
  }

  console.log("\n3. In-progress session with working sets");
  {
    const fake = new FakeSupabase();
    fake.addSession("s3", "user1", "in_progress", "2026-10-24T11:00:00Z", today, "Pull");
    fake.addExercise("ex2", "s3");
    fake.addSet("set2", "user1", "ex2", true); // warm-up
    fake.addSet("set3", "user1", "ex2", false); // working
    fake.addSet("set4", "user1", "ex2", false); // working

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session", result !== null);
    check("session id", result?.id === "s3", result?.id);
    check("title from program_day", result?.title === "Pull", result?.title);
    check("workingSetsLogged excludes warm-up", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n4. L3: 0-set in-progress session is returned");
  {
    const fake = new FakeSupabase();
    fake.addSession("s4", "user1", "in_progress", "2026-10-24T12:00:00Z", today, "Legs");
    fake.addExercise("ex3", "s4");

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session", result !== null);
    check("workingSetsLogged is 0", result?.workingSetsLogged === 0, String(result?.workingSetsLogged));
  }

  console.log("\n5. Multiple in-progress sessions → returns most recent by started_at");
  {
    const fake = new FakeSupabase();
    fake.addSession("s5", "user1", "in_progress", "2026-10-24T09:00:00Z", today, "Upper");
    fake.addSession("s6", "user1", "in_progress", "2026-10-24T13:00:00Z", today, "Lower");
    fake.addExercise("ex4", "s5");
    fake.addExercise("ex5", "s6");
    fake.addSet("set5", "user1", "ex4", false);
    fake.addSet("set6", "user1", "ex5", false);
    fake.addSet("set7", "user1", "ex5", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns most recent", result?.id === "s6", result?.id);
    check("workingSetsLogged from s6", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n6. Session without program_days → title defaults to 'Workout'");
  {
    const fake = new FakeSupabase();
    fake.addSession("s7", "user1", "in_progress", "2026-10-24T14:00:00Z", today, null);
    fake.addExercise("ex6", "s7");
    fake.addSet("set8", "user1", "ex6", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("title defaults to Workout", result?.title === "Workout", result?.title);
  }

  console.log("\n7. NEW: Session starting at 23:43 IST on day D, checked at 00:01 IST on D+1");
  {
    const fake = new FakeSupabase();
    // Session started at 23:43 IST on Oct 23 (local_date would be "2026-10-23")
    // Simulating checking it after midnight on Oct 24
    const yesterdayIST = "2026-10-23"; // Day D
    fake.addSession("s8", "user1", "in_progress", "2026-10-23T18:13:00Z", yesterdayIST, "Late Night Push");
    fake.addExercise("ex7", "s8");
    fake.addSet("set9", "user1", "ex7", false);
    fake.addSet("set10", "user1", "ex7", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "Asia/Kolkata"
    );
    check("returns session after midnight", result !== null);
    check("correct session id", result?.id === "s8", result?.id);
    check("correct title", result?.title === "Late Night Push", result?.title);
    check("correct set count", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n8. NEW: Timezone change - session created in LA, profile now in Kolkata");
  {
    const fake = new FakeSupabase();
    const laDate = localDateString("America/Los_Angeles", new Date("2026-10-23T10:00:00Z"));
    fake.addSession("s9", "user1", "in_progress", "2026-10-23T10:00:00Z", laDate, "LA Session");
    fake.addExercise("ex8", "s9");
    fake.addSet("set11", "user1", "ex8", false);

    // User's timezone is now Kolkata (different local date from LA)
    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "Asia/Kolkata"
    );
    check("returns session despite timezone change", result !== null);
    check("correct session id", result?.id === "s9", result?.id);
  }

  console.log("\n9. NEW: Multiple in_progress rows (legacy) - newest started_at wins");
  {
    const fake = new FakeSupabase();
    // Legacy data before migration 000022
    fake.addSession("s10", "user1", "in_progress", "2026-10-23T10:00:00Z", yesterday, "Old Session");
    fake.addSession("s11", "user1", "in_progress", "2026-10-24T14:00:00Z", today, "New Session");
    fake.addExercise("ex9", "s10");
    fake.addExercise("ex10", "s11");
    fake.addSet("set12", "user1", "ex9", false);
    fake.addSet("set13", "user1", "ex10", false);
    fake.addSet("set14", "user1", "ex10", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns newest by started_at", result?.id === "s11", result?.id);
    check("correct set count", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n10. NEW: Completed/skipped/planned sessions are never returned");
  {
    const fake = new FakeSupabase();
    fake.addSession("s12", "user1", "completed", "2026-10-24T10:00:00Z", today, "Completed");
    fake.addSession("s13", "user1", "skipped", "2026-10-24T11:00:00Z", today, "Skipped");
    fake.addSession("s14", "user1", "planned", "2026-10-24T12:00:00Z", today, "Planned");
    fake.addExercise("ex11", "s12");
    fake.addExercise("ex12", "s13");
    fake.addSet("set15", "user1", "ex11", false);
    fake.addSet("set16", "user1", "ex12", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns null for non-in_progress sessions", result === null);
  }

  console.log("\n11. NEW: Null started_at handled correctly (nulls last in order)");
  {
    const fake = new FakeSupabase();
    fake.addSession("s15", "user1", "in_progress", null, today, "Null Started");
    fake.addSession("s16", "user1", "in_progress", "2026-10-24T14:00:00Z", today, "Real Started");
    fake.addExercise("ex13", "s15");
    fake.addExercise("ex14", "s16");
    fake.addSet("set17", "user1", "ex13", false);
    fake.addSet("set18", "user1", "ex14", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session with real started_at (nulls last)", result?.id === "s16", result?.id);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
